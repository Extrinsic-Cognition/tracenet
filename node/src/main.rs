use std::env;
use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Result};
use n0_future::StreamExt;
use tracenet::crystal::{CrystalAnnounce, CrystalV1, OutcomeProof};
use tracenet::keys::{blake3_hex, NodeIdentity};
use tracenet::membrane::{find_gate_script, run_privacy_membrane};
use tracenet::net::TraceNetNode;

fn default_dir() -> PathBuf {
    env::var("TRACENET_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join(".tracenet")
        })
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    let cmd = args.first().map(String::as_str).unwrap_or("help");

    match cmd {
        "init" => {
            let dir = default_dir();
            let id = NodeIdentity::generate();
            id.save(&dir)?;
            let pkarr = id.signed_pkarr("https://relay.iroh.network")?;
            println!("Initialized 4-key TraceNet identity at {}", dir.display());
            println!("  transport_id : {}", id.transport_id());
            println!("  author_key   : {}", id.author_b58());
            println!("  human_key    : {}", id.human_b58());
            println!("  solana_key   : {}", id.solana_b58());
            println!("  pkarr_sig    : {}...", &pkarr.signature[..24]);
        }
        "id" => {
            let dir = default_dir();
            let id = NodeIdentity::load(&dir)?;
            let pkarr = id.signed_pkarr("https://relay.iroh.network")?;
            println!("{}", serde_json::to_string_pretty(&pkarr)?);
        }
        "offer" => {
            let file = args.get(1).ok_or_else(|| anyhow::anyhow!("usage: tracenet offer <file> [domain]"))?;
            let domain = args.get(2).cloned().unwrap_or_else(|| "general".into());
            let dir = default_dir();
            let id = NodeIdentity::load(&dir)?;
            let raw = fs::read_to_string(file)?;
            let gate = find_gate_script()?;
            let gated = run_privacy_membrane(&raw, &gate)?;
            let crystal = CrystalV1::create_signed(
                &id,
                vec![domain],
                blake3_hex(file.as_bytes()),
                gated.text,
                OutcomeProof {
                    kind: "membrane_canary_verified".into(),
                    value: format!("{}/{}", gated.canary_caught, gated.canary_seeded),
                },
                gated.canary_recall,
                "share-public",
            )?;
            crystal.verify_shareable()?;
            println!("Crystal BLAKE3: {}", crystal.blake3_address()?);
            println!(
                "Membrane withheld {} item(s); canary recall {}/{} (100%)",
                gated.withheld_count, gated.canary_caught, gated.canary_seeded
            );
            println!("{}", serde_json::to_string_pretty(&crystal)?);
        }
        "demo" => {
            println!("=== TraceNet Live 2-Peer Iroh 0.97 Open Traces Demo ===");
            let gate = find_gate_script()?;
            let raw_trace = concat!(
                "Solved QUIC reconnection bug in ~/code-ec/project/src/net.rs.\n",
                "Verified test suite passed (12/12).\n",
                "Accidental secret leak test: sk_live_51FakeDemoKeyForMembrane1234567890\n",
                "Local LAN peer: 192.168.1.42\n"
            );
            let gated = run_privacy_membrane(raw_trace, &gate)?;
            println!(
                "[1/4] Privacy Membrane passed: withheld {} secrets/PII, canary recall {}/{}",
                gated.withheld_count, gated.canary_caught, gated.canary_seeded
            );

            let alice = TraceNetNode::start(NodeIdentity::generate()).await?;
            let bob = TraceNetNode::start(NodeIdentity::generate()).await?;

            let crystal = CrystalV1::create_signed(
                &alice.id,
                vec!["rust".into(), "iroh".into()],
                blake3_hex(b"quic-reconnect-fix"),
                gated.text,
                OutcomeProof {
                    kind: "test_pass".into(),
                    value: "12/12".into(),
                },
                gated.canary_recall,
                "share-public",
            )?;

            // Gossip announcement over iroh-gossip + blob hosting over iroh-blobs
            let topic = TraceNetNode::topic_id("tracenet/domain/rust/v1");
            let alice_topic = alice.gossip.subscribe(topic, vec![]).await?;
            let (alice_tx, _alice_rx) = alice_topic.split();

            bob.lookup.add_endpoint_info(alice.addr());
            let bob_topic = bob.gossip.subscribe(topic, vec![alice.endpoint.id()]).await?;
            let (_bob_tx, mut bob_rx) = bob_topic.split();

            let announce = alice.publish_crystal(&crystal).await?;
            println!(
                "[2/4] Alice published crystal {} (blob {})",
                &announce.hash[..16],
                &announce.blob_hash[..16]
            );

            // Best-effort gossip announcement alongside direct fetch
            let announce_bytes = serde_json::to_vec(&announce)?;
            let _ = alice_tx.broadcast(announce_bytes.into()).await;
            if let Ok(Some(Ok(iroh_gossip::api::Event::Received(msg)))) =
                tokio::time::timeout(std::time::Duration::from_millis(600), bob_rx.next()).await
            {
                if let Ok(got) = serde_json::from_slice::<CrystalAnnounce>(&msg.content) {
                    got.verify()?;
                    println!("[3/4] Bob received verified iroh-gossip announcement from Alice");
                }
            } else {
                println!("[3/4] Bob dialing Alice directly over tracenet/handshake/v1 + iroh-blobs");
            }

            let received = bob.fetch_crystal(alice.addr(), &announce.hash).await?;
            println!(
                "[4/4] Bob verified BLAKE3 + human_key consent + author_key sig! Receipts on Alice: {}",
                alice.receipt_count().await
            );
            println!("Sanitized crystal body:\n{}", received.approach);

            bob.shutdown().await?;
            alice.shutdown().await?;
        }
        "help" | "--help" | "-h" => {
            println!("tracenet — Open Traces P2P node (iroh 0.97 + privacy membrane)");
            println!("Commands:");
            println!("  tracenet init                   Generate 4-key identity & signed Pkarr record");
            println!("  tracenet id                     Print signed Pkarr record");
            println!("  tracenet offer <file> [domain]  Run 22-canary privacy membrane & sign crystal");
            println!("  tracenet demo                   Run live 2-peer iroh-gossip + iroh-blobs exchange");
        }
        other => bail!("unknown command: {other}"),
    }
    Ok(())
}
