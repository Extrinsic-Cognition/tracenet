//! Tit-for-tat share-ratio enforcement (TRACENET2.md §7).

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub const GRACE_DOWNLOADS: u64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerTier {
    Preferred,  // >= 2.0
    Normal,     // >= 1.0 (or within 5-download grace period)
    Degraded,   // >= 0.5
    Restricted, // >= 0.1 (metadata only)
    Blocked,    // <  0.1
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PeerStats {
    pub bytes_served: u64,   // bytes this peer served to us (credit)
    pub bytes_consumed: u64, // bytes we served to this peer (debit)
    pub downloads_granted: u64,
    pub receipts_received: u64,
}

impl PeerStats {
    pub fn share_ratio(&self) -> f64 {
        if self.bytes_consumed == 0 {
            return 1.0;
        }
        (self.bytes_served as f64) / (self.bytes_consumed as f64)
    }

    pub fn tier(&self) -> PeerTier {
        if self.downloads_granted < GRACE_DOWNLOADS {
            return PeerTier::Normal;
        }
        let r = self.share_ratio();
        if r >= 2.0 {
            PeerTier::Preferred
        } else if r >= 1.0 {
            PeerTier::Normal
        } else if r >= 0.5 {
            PeerTier::Degraded
        } else if r >= 0.1 {
            PeerTier::Restricted
        } else {
            PeerTier::Blocked
        }
    }

    pub fn can_download(&self) -> bool {
        matches!(
            self.tier(),
            PeerTier::Preferred | PeerTier::Normal | PeerTier::Degraded
        )
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct RatioTable {
    pub peers: HashMap<String, PeerStats>,
}

impl RatioTable {
    pub fn tier_of(&self, author_key: &str) -> PeerTier {
        self.peers
            .get(author_key)
            .map(PeerStats::tier)
            .unwrap_or(PeerTier::Normal)
    }

    pub fn can_download(&self, author_key: &str) -> bool {
        self.peers
            .get(author_key)
            .map(PeerStats::can_download)
            .unwrap_or(true)
    }

    pub fn record_served_to_peer(&mut self, author_key: &str, bytes: u64) {
        let e = self.peers.entry(author_key.to_string()).or_default();
        e.bytes_consumed = e.bytes_consumed.saturating_add(bytes);
        e.downloads_granted = e.downloads_granted.saturating_add(1);
    }

    pub fn record_received_from_peer(&mut self, author_key: &str, bytes: u64) {
        let e = self.peers.entry(author_key.to_string()).or_default();
        e.bytes_served = e.bytes_served.saturating_add(bytes);
        e.receipts_received = e.receipts_received.saturating_add(1);
    }
}
