//! Bridge to `membrane/gate.mjs` — runs the 5-stage privacy membrane + 22-kind canary recall test
//! before any raw trace becomes a shareable crystal. Fails closed if canary recall < 1.0.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct GateResult {
    pub text: String,
    pub withheld_count: u64,
    pub canary_seeded: u64,
    pub canary_caught: u64,
    pub canary_recall: f64,
    pub canary_missed: Vec<String>,
}

pub fn find_gate_script() -> Result<PathBuf> {
    let candidates = [
        PathBuf::from("membrane/tracenet-offer/gate.mjs"),
        PathBuf::from("../membrane/tracenet-offer/gate.mjs"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../membrane/tracenet-offer/gate.mjs"),
    ];
    for c in candidates {
        if c.is_file() {
            return Ok(c.canonicalize()?);
        }
    }
    Err(anyhow!("could not locate membrane/tracenet-offer/gate.mjs"))
}

/// Sanitize raw text through `membrane/gate.mjs` and measure 22-kind canary recall.
pub fn run_privacy_membrane(raw_text: &str, gate_mjs: &Path) -> Result<GateResult> {
    let runner = r#"
      import { pathToFileURL } from 'node:url';
      const gateUrl = pathToFileURL(process.argv[1]).href;
      const { gate, recallOf } = await import(gateUrl);
      const chunks = [];
      for await (const c of process.stdin) chunks.push(c);
      const text = Buffer.concat(chunks).toString('utf8');
      const g = gate([text], { scanners: [] });
      const r = recallOf([text], { scanners: [] }, 42);
      process.stdout.write(JSON.stringify({
        text: g.texts[0],
        withheld_count: g.n,
        canary_seeded: r.seeded,
        canary_caught: r.caught,
        canary_recall: r.recall,
        canary_missed: r.missed,
      }));
    "#;

    let mut child = Command::new("node")
        .args(["--input-type=module", "-e", runner, &gate_mjs.to_string_lossy()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to spawn node for membrane/gate.mjs")?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(raw_text.as_bytes())?;
    }

    let out = child.wait_with_output()?;
    if !out.status.success() {
        bail!(
            "membrane/gate.mjs failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    let res: GateResult =
        serde_json::from_slice(&out.stdout).context("failed to parse gate.mjs output")?;
    if res.canary_recall < 1.0 {
        bail!(
            "privacy membrane canary recall {:.1}% < 100% (missed: {:?})",
            res.canary_recall * 100.0,
            res.canary_missed
        );
    }
    Ok(res)
}
