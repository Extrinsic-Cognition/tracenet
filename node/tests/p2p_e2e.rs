use tracenet::crystal::{CrystalV1, OutcomeProof};
use tracenet::keys::{blake3_hex, NodeIdentity};
use tracenet::membrane::{find_gate_script, run_privacy_membrane};
use tracenet::net::TraceNetNode;

#[tokio::test]
async fn two_peer_iroh_open_traces_exchange_with_privacy_membrane() {
    let gate = find_gate_script().expect("membrane/gate.mjs present");
    let raw_trace = concat!(
        "Fixed replay bug in solver.\n",
        "Accidental key: sk_live_99SyntheticTestKeyNeverReal12345678\n",
        "Private LAN: 192.168.8.164\n",
        "Personal path: /Users/alice/.embertide/secret.key\n"
    );

    let gated = run_privacy_membrane(raw_trace, &gate).expect("membrane passes 100% canary recall");
    assert_eq!(gated.canary_recall, 1.0);
    assert!(gated.canary_seeded >= 20);
    assert!(!gated.text.contains("sk_live_"));
    assert!(!gated.text.contains("192.168.8.164"));
    assert!(!gated.text.contains("/Users/alice"));

    let alice = TraceNetNode::start(NodeIdentity::generate())
        .await
        .expect("start alice");
    let bob = TraceNetNode::start(NodeIdentity::generate())
        .await
        .expect("start bob");

    let pkarr = alice.id.signed_pkarr("https://relay.iroh.network").unwrap();
    pkarr.verify().expect("pkarr author->solana record verifies");

    let crystal = CrystalV1::create_signed(
        &alice.id,
        vec!["rust".into(), "solana".into()],
        blake3_hex(b"replay-bug-fix"),
        gated.text.clone(),
        OutcomeProof {
            kind: "test_pass".into(),
            value: "all green".into(),
        },
        gated.canary_recall,
        "share-public",
    )
    .expect("create signed crystal");

    let announce = alice.publish_crystal(&crystal).await.expect("publish");
    announce.verify().expect("announcement signature valid");

    let fetched = bob
        .fetch_crystal(alice.addr(), &announce.hash)
        .await
        .expect("bob fetches over iroh-blobs + handshake");

    assert_eq!(fetched.blake3_address().unwrap(), announce.hash);
    assert_eq!(fetched.approach, gated.text);
    assert_eq!(fetched.author, alice.id.author_b58());
    assert_eq!(fetched.human_consent.human_key, alice.id.human_b58());

    // Give Alice's async receipt handler a moment to record receipt + ratio
    tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    assert_eq!(alice.receipt_count().await, 1);

    bob.shutdown().await.unwrap();
    alice.shutdown().await.unwrap();
}

#[tokio::test]
async fn fail_closed_on_local_consent_policy() {
    let alice = TraceNetNode::start(NodeIdentity::generate()).await.unwrap();
    let local_only = CrystalV1::create_signed(
        &alice.id,
        vec!["private".into()],
        blake3_hex(b"private-thought"),
        "private note".into(),
        OutcomeProof {
            kind: "user_accept".into(),
            value: "ok".into(),
        },
        1.0,
        "local",
    )
    .unwrap();

    let err = alice.publish_crystal(&local_only).await.unwrap_err();
    assert!(err.to_string().contains("forbids network export"));
    alice.shutdown().await.unwrap();
}

#[tokio::test]
async fn tit_for_tat_blocks_leecher_after_grace_period() {
    let alice = TraceNetNode::start(NodeIdentity::generate()).await.unwrap();
    let leech = TraceNetNode::start(NodeIdentity::generate()).await.unwrap();

    let crystal = CrystalV1::create_signed(
        &alice.id,
        vec!["rust".into()],
        blake3_hex(b"sample"),
        "sanitized crystal".into(),
        OutcomeProof {
            kind: "test_pass".into(),
            value: "ok".into(),
        },
        1.0,
        "share-public",
    )
    .unwrap();
    let announce = alice.publish_crystal(&crystal).await.unwrap();

    // Simulate leecher having exhausted 5 free grace downloads with 0 bytes contributed back
    {
        let ratios = alice.ratios();
        let mut table = ratios.lock().await;
        for _ in 0..5 {
            table.record_served_to_peer(&leech.id.author_b58(), 4096);
        }
    }

    let err = leech
        .fetch_crystal(alice.addr(), &announce.hash)
        .await
        .unwrap_err();
    assert!(
        err.to_string().contains("share_ratio_low"),
        "expected share_ratio_low, got: {err}"
    );

    leech.shutdown().await.unwrap();
    alice.shutdown().await.unwrap();
}
