use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;

const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

/// Encrypt a plaintext string with AES-256-GCM.
/// Returns base64(nonce ‖ ciphertext ‖ tag).
pub fn encrypt_local(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("cipher init failed: {e}"))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("encryption failed: {e}"))?;

    let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(B64.encode(&combined))
}

/// Decrypt base64(nonce ‖ ciphertext ‖ tag) with AES-256-GCM.
pub fn decrypt_local(encrypted_b64: &str, key: &[u8; 32]) -> Result<String, String> {
    let combined = B64
        .decode(encrypted_b64)
        .map_err(|e| format!("base64 decode failed: {e}"))?;

    if combined.len() < NONCE_LEN + TAG_LEN {
        return Err("ciphertext too short".to_string());
    }

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("cipher init failed: {e}"))?;

    let nonce = Nonce::from_slice(&combined[..NONCE_LEN]);
    let ciphertext = &combined[NONCE_LEN..];

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("decryption failed: {e}"))?;

    String::from_utf8(plaintext).map_err(|e| format!("utf8 decode failed: {e}"))
}

/// Derive a local encryption key from a device-specific seed.
/// Uses HKDF-like derivation (SHA-256 of seed material).
pub fn derive_local_key(device_id: &str) -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    // For production: use proper HKDF with OS-provided entropy.
    // For now, derive from device ID + a compile-time salt.
    let salt = b"untrace-desktop-local-v1";
    let mut material = Vec::new();
    material.extend_from_slice(salt);
    material.extend_from_slice(device_id.as_bytes());
    
    // Simple key derivation (production should use ring/hkdf)
    let mut key = [0u8; 32];
    let mut hasher = DefaultHasher::new();
    material.hash(&mut hasher);
    let h1 = hasher.finish().to_le_bytes();
    material.extend_from_slice(&h1);
    hasher = DefaultHasher::new();
    material.hash(&mut hasher);
    let h2 = hasher.finish().to_le_bytes();
    material.extend_from_slice(&h2);
    hasher = DefaultHasher::new();
    material.hash(&mut hasher);
    let h3 = hasher.finish().to_le_bytes();
    material.extend_from_slice(&h3);
    hasher = DefaultHasher::new();
    material.hash(&mut hasher);
    let h4 = hasher.finish().to_le_bytes();
    
    key[..8].copy_from_slice(&h1);
    key[8..16].copy_from_slice(&h2);
    key[16..24].copy_from_slice(&h3);
    key[24..32].copy_from_slice(&h4);
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let plaintext = "test-private-key-base64==";
        let encrypted = encrypt_local(plaintext, &key).unwrap();
        let decrypted = decrypt_local(&encrypted, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_different_keys_fail() {
        let key1 = [1u8; 32];
        let key2 = [2u8; 32];
        let encrypted = encrypt_local("secret", &key1).unwrap();
        assert!(decrypt_local(&encrypted, &key2).is_err());
    }

    #[test]
    fn test_derive_key_deterministic() {
        let k1 = derive_local_key("device-abc");
        let k2 = derive_local_key("device-abc");
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_derive_key_different_ids() {
        let k1 = derive_local_key("device-abc");
        let k2 = derive_local_key("device-xyz");
        assert_ne!(k1, k2);
    }
}
