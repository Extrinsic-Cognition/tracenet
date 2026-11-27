//! Live iroh 0.97 P2P TraceNet node:
//!   - `iroh-gossip` (`/iroh-gossip/1`): crystal & beacon topic broadcasts
//!   - `iroh-blobs`: BLAKE3 chunk-verified streaming crystal transfers
//!   - `tracenet/handshake/v1`: INTRODUCE -> share_ratio gate -> OFFER -> TRANSFER -> RECEIPT

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, bail, Context, Result};
use iroh::address_lookup::memory::MemoryLookup;
use iroh::endpoint::{presets, Connection, RecvStream, SendStream};
use iroh::protocol::{AcceptError, ProtocolHandler, Router};
use iroh::{Endpoint, EndpointAddr};
use iroh_blobs::api::downloader::Shuffled;
use iroh_blobs::api::Store;
use iroh_blobs::store::mem::MemStore;
use iroh_blobs::{BlobsProtocol, Hash, HashAndFormat, ALPN as BLOBS_ALPN};
use iroh_gossip::net::{Gossip, GOSSIP_ALPN};
use iroh_gossip::proto::TopicId;
use tokio::sync::Mutex;

use crate::crystal::{CrystalAnnounce, CrystalV1, HandshakeMsg};
use crate::keys::{blake3_hex, canonical_json, now_unix_s, parse_pubkey_b58, sign_digest, verify_digest, NodeIdentity};
use crate::ratio::RatioTable;

pub const HANDSHAKE_ALPN: &[u8] = b"tracenet/handshake/v1";
const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone)]
struct StoredCrystal {
    crystal_hash: String,
    blob_hash: Hash,
    size_bytes: u64,
}

#[derive(Clone)]
struct NodeState {
    id: NodeIdentity,
    crystals: Arc<Mutex<HashMap<String, StoredCrystal>>>,
    ratios: Arc<Mutex<RatioTable>>,
    receipts: Arc<Mutex<Vec<HandshakeMsg>>>,
}

async fn write_frame(send: &mut SendStream, msg: &HandshakeMsg) -> Result<()> {
    let bytes = serde_json::to_vec(msg)?;
    if bytes.len() > MAX_FRAME_BYTES {
        bail!("frame too large");
    }
    send.write_all(&(bytes.len() as u32).to_be_bytes()).await?;
    send.write_all(&bytes).await?;
    Ok(())
}

async fn read_frame(recv: &mut RecvStream) -> Result<HandshakeMsg> {
    let mut len_buf = [0u8; 4];
    recv.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > MAX_FRAME_BYTES {
        bail!("frame exceeds max size");
    }
    let mut buf = vec![0u8; len];
    recv.read_exact(&mut buf).await?;
    Ok(serde_json::from_slice(&buf)?)
}

#[derive(Clone)]
struct HandshakeHandler {
    state: NodeState,
}

impl std::fmt::Debug for HandshakeHandler {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HandshakeHandler").finish()
    }
}

impl ProtocolHandler for HandshakeHandler {
    async fn accept(&self, conn: Connection) -> Result<(), AcceptError> {
        let state = self.state.clone();
        if let Err(e) = handle_handshake(conn, state).await {
            eprintln!("[tracenet/handshake] session ended: {e}");
        }
        Ok(())
    }
}

async fn handle_handshake(conn: Connection, state: NodeState) -> Result<()> {
    let (mut send, mut recv) = conn.accept_bi().await?;

    // 1. INTRODUCE
    let intro = read_frame(&mut recv).await?;
    let (peer_author, nonce) = match intro {
        HandshakeMsg::Introduce {
            author,
            transport_id,
            ts,
            nonce,
            signature,
            ..
        } => {
            let pk = parse_pubkey_b58(&author)?;
            let pre = canonical_json(&serde_json::json!({
                "type": "introduce", "v": 1, "author": author,
                "transport_id": transport_id, "ts": ts, "nonce": nonce
            }));
            verify_digest(&pk, pre.as_bytes(), &signature)?;
            (author, nonce)
        }
        _ => bail!("expected introduce"),
    };

    let allowed = state.ratios.lock().await.can_download(&peer_author);
    let ack_ts = now_unix_s();
    let ack_pre = canonical_json(&serde_json::json!({
        "type": "introduce_ack", "v": 1, "author": state.id.author_b58(),
        "accepted": allowed, "nonce": nonce, "ts": ack_ts
    }));
    let ack = HandshakeMsg::IntroduceAck {
        v: 1,
        author: state.id.author_b58(),
        transport_id: state.id.transport_id(),
        share_ratio: 1.0,
        accepted: allowed,
        reject_reason: if allowed {
            None
        } else {
            Some("share_ratio_low".into())
        },
        ts: ack_ts,
        nonce,
        signature: sign_digest(&state.id.author, ack_pre.as_bytes()),
    };
    write_frame(&mut send, &ack).await?;
    if !allowed {
        send.finish()?;
        let _ = send.stopped().await;
        return Ok(());
    }

    // 2. REQUEST_CRYSTAL -> OFFER / DECLINE
    let req = read_frame(&mut recv).await?;
    let wanted_hash = match req {
        HandshakeMsg::RequestCrystal { crystal_hash } => crystal_hash,
        _ => bail!("expected request_crystal"),
    };

    let found = state.crystals.lock().await.get(&wanted_hash).cloned();
    let Some(entry) = found else {
        write_frame(
            &mut send,
            &HandshakeMsg::Decline {
                crystal_hash: wanted_hash,
                reason: "not_found".into(),
            },
        )
        .await?;
        send.finish()?;
        let _ = send.stopped().await;
        return Ok(());
    };

    write_frame(
        &mut send,
        &HandshakeMsg::Offer {
            crystal_hash: entry.crystal_hash.clone(),
            blob_hash: entry.blob_hash.to_string(),
            size_bytes: entry.size_bytes,
        },
    )
    .await?;

    // 3. Wait for signed RECEIPT after peer fetches over iroh-blobs
    let receipt = read_frame(&mut recv).await?;
    if let HandshakeMsg::Receipt {
        ref crystal_hash,
        verified,
        ts,
        ref author,
        ref signature,
    } = receipt
    {
        if *crystal_hash == entry.crystal_hash && verified && *author == peer_author {
            let pk = parse_pubkey_b58(author)?;
            let pre = canonical_json(&serde_json::json!({
                "type": "receipt", "crystal_hash": crystal_hash,
                "verified": verified, "ts": ts, "author": author
            }));
            verify_digest(&pk, pre.as_bytes(), signature)?;
            state
                .ratios
                .lock()
                .await
                .record_served_to_peer(&peer_author, entry.size_bytes);
            state.receipts.lock().await.push(receipt);
            send.write_all(&[0x01]).await?;
        }
    }

    send.finish()?;
    let _ = send.stopped().await;
    Ok(())
}

pub struct TraceNetNode {
    pub id: NodeIdentity,
    pub endpoint: Endpoint,
    pub store: Store,
    pub gossip: Gossip,
    pub lookup: MemoryLookup,
    _router: Router,
    state: NodeState,
}

impl TraceNetNode {
    pub async fn start(id: NodeIdentity) -> Result<Self> {
        let lookup = MemoryLookup::new();
        let endpoint = Endpoint::builder(presets::N0)
            .address_lookup(lookup.clone())
            .secret_key(id.transport.clone())
            .bind()
            .await
            .context("iroh Endpoint::bind failed")?;

        let gossip = Gossip::builder().spawn(endpoint.clone());
        let store: Store = MemStore::new().into();
        let blobs = BlobsProtocol::new(&store, None);

        let state = NodeState {
            id: id.clone(),
            crystals: Arc::new(Mutex::new(HashMap::new())),
            ratios: Arc::new(Mutex::new(RatioTable::default())),
            receipts: Arc::new(Mutex::new(Vec::new())),
        };

        let router = Router::builder(endpoint.clone())
            .accept(GOSSIP_ALPN, gossip.clone())
            .accept(BLOBS_ALPN, blobs)
            .accept(HANDSHAKE_ALPN, HandshakeHandler { state: state.clone() })
            .spawn();

        Ok(Self {
            id,
            endpoint,
            store,
            gossip,
            lookup,
            _router: router,
            state,
        })
    }

    pub fn addr(&self) -> EndpointAddr {
        self.endpoint.addr()
    }

    pub fn ratios(&self) -> Arc<Mutex<RatioTable>> {
        self.state.ratios.clone()
    }

    pub async fn receipt_count(&self) -> usize {
        self.state.receipts.lock().await.len()
    }

    pub fn topic_id(name: &str) -> TopicId {
        TopicId::from_bytes(*blake3::hash(name.as_bytes()).as_bytes())
    }

    /// Verify human consent + author signature, store in iroh-blobs, and return signed CrystalAnnounce.
    pub async fn publish_crystal(&self, crystal: &CrystalV1) -> Result<CrystalAnnounce> {
        crystal.verify_shareable()?;
        let bytes = crystal.canonical_bytes()?;
        let crystal_hash = blake3_hex(&bytes);
        let size_bytes = bytes.len() as u64;

        let mut tag = self
            .store
            .add_bytes(bytes)
            .temp_tag()
            .await
            .map_err(|e| anyhow!("iroh-blobs add_bytes: {e:?}"))?;
        let blob_hash = tag.hash();
        tag.leak();

        self.state.crystals.lock().await.insert(
            crystal_hash.clone(),
            StoredCrystal {
                crystal_hash: crystal_hash.clone(),
                blob_hash,
                size_bytes,
            },
        );

        CrystalAnnounce::sign_new(&self.id, crystal, blob_hash.to_string(), size_bytes)
    }

    /// Handshake with peer over `tracenet/handshake/v1`, fetch BLAKE3-verified bytes over `iroh-blobs`,
    /// verify both human consent and author Ed25519 signatures, and return signed `RECEIPT`.
    pub async fn fetch_crystal(
        &self,
        peer_addr: EndpointAddr,
        crystal_hash: &str,
    ) -> Result<CrystalV1> {
        self.lookup.add_endpoint_info(peer_addr.clone());

        let conn = self
            .endpoint
            .connect(peer_addr.clone(), HANDSHAKE_ALPN)
            .await
            .context("connect tracenet/handshake/v1 failed")?;
        let (mut send, mut recv) = conn.open_bi().await?;

        // 1. INTRODUCE
        let nonce = blake3_hex(&now_unix_s().to_le_bytes());
        let intro = HandshakeMsg::sign_introduce(&self.id, 1.0, nonce.clone())?;
        write_frame(&mut send, &intro).await?;

        let ack = read_frame(&mut recv).await?;
        let peer_author = match ack {
            HandshakeMsg::IntroduceAck {
                author,
                accepted,
                reject_reason,
                ..
            } => {
                if !accepted {
                    bail!(
                        "peer rejected introduce: {}",
                        reject_reason.unwrap_or_else(|| "unknown".into())
                    );
                }
                author
            }
            _ => bail!("expected introduce_ack"),
        };

        // 2. REQUEST_CRYSTAL
        write_frame(
            &mut send,
            &HandshakeMsg::RequestCrystal {
                crystal_hash: crystal_hash.to_string(),
            },
        )
        .await?;

        let offer = read_frame(&mut recv).await?;
        let (blob_hash_str, size_bytes) = match offer {
            HandshakeMsg::Offer {
                blob_hash,
                size_bytes,
                ..
            } => (blob_hash, size_bytes),
            HandshakeMsg::Decline { reason, .. } => bail!("peer declined offer: {reason}"),
            _ => bail!("expected offer or decline"),
        };

        // 3. TRANSFER via iroh-blobs (chunk-verified BLAKE3!)
        let blob_hash: Hash = blob_hash_str
            .parse()
            .map_err(|e| anyhow!("invalid blob hash: {e:?}"))?;
        let req = HashAndFormat::raw(blob_hash);
        let providers = Shuffled::new(vec![peer_addr.id]);
        self.store
            .downloader(&self.endpoint)
            .download(req, providers)
            .await
            .map_err(|e| anyhow!("iroh-blobs download failed: {e:?}"))?;

        let raw = self
            .store
            .get_bytes(blob_hash)
            .await
            .map_err(|e| anyhow!("iroh-blobs get_bytes failed: {e:?}"))?;

        // 4. Verify permanent BLAKE3 address + dual Ed25519 signatures (human consent + author)
        let actual_hash = blake3_hex(&raw);
        if actual_hash != crystal_hash {
            bail!(
                "crystal hash mismatch: expected {crystal_hash}, got {actual_hash}"
            );
        }
        let crystal: CrystalV1 = serde_json::from_slice(&raw)?;
        crystal.verify_shareable()?;

        // 5. Send signed RECEIPT, wait for deterministic 1-byte receipt ACK, update local peer ratio
        let receipt = HandshakeMsg::sign_receipt(&self.id, crystal_hash.to_string(), true)?;
        write_frame(&mut send, &receipt).await?;
        send.finish()?;
        let mut ack_byte = [0u8; 1];
        let _ = recv.read_exact(&mut ack_byte).await;

        self.state
            .ratios
            .lock()
            .await
            .record_received_from_peer(&peer_author, size_bytes);

        Ok(crystal)
    }

    pub async fn shutdown(self) -> Result<()> {
        self._router.shutdown().await?;
        Ok(())
    }
}
