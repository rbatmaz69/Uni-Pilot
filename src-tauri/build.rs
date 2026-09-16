fn main() {
    println!("cargo:rerun-if-changed=native/Reminders.swift");
    println!("cargo:rerun-if-changed=../public/reminders/plane.png");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
        let target = if arch == "aarch64" {
            "arm64-apple-macosx11.0"
        } else {
            "x86_64-apple-macosx11.0"
        };
        let status = std::process::Command::new("xcrun")
            .args(["swiftc", "-O", "-target", target, "-module-cache-path"])
            .arg(out.join("swift-cache"))
            .arg("native/Reminders.swift")
            .arg("-o")
            .arg(out.join("uni-pilot-reminders"))
            .status()
            .expect("Xcode Command Line Tools are required for macOS reminders");
        assert!(
            status.success(),
            "Could not build the macOS reminder companion"
        );
    }
    tauri_build::build()
}
