/**
 * Unit Tests — securityService (بخش ۸ پرامت)
 * تست امنیت: هش رمز، تأیید، رمزگذاری، یکپارچگی
 */
import { describe, it, expect } from 'vitest';
import { securityService } from './securityService';

describe('Security — هش و تأیید رمز عبور', () => {
  it('باید رمز عبور صحیح را تأیید کند', async () => {
    const password = 'MySecureP@ss123';
    const hashed = await securityService.hashCredential(password);
    const valid = await securityService.verifyCredential(password, hashed);
    expect(valid).toBe(true);
  });

  it('باید رمز عبور اشتباه رد شود', async () => {
    const hashed = await securityService.hashCredential('correct-password');
    const valid = await securityService.verifyCredential('wrong-password', hashed);
    expect(valid).toBe(false);
  });

  it('رمز عبور نباید به صورت Plain Text در hash ذخیره شود', async () => {
    const password = 'MySecret123';
    const hashed = await securityService.hashCredential(password);
    // hash نباید شامل رمز اصلی باشد
    expect(hashed.hash).not.toContain(password);
    expect(hashed.salt).not.toContain(password);
    expect(JSON.stringify(hashed)).not.toContain(password);
  });

  it('باید salt تصادفی باشد (دو hash یکسان نباشند)', async () => {
    const password = 'SamePassword';
    const h1 = await securityService.hashCredential(password);
    const h2 = await securityService.hashCredential(password);
    expect(h1.salt).not.toBe(h2.salt);
    expect(h1.hash).not.toBe(h2.hash);
  });

  it('باید hash طول معقول داشته باشد', async () => {
    const hashed = await securityService.hashCredential('test');
    expect(hashed.hash.length).toBeGreaterThan(32);
    expect(hashed.salt.length).toBeGreaterThan(16);
  });

  it('باید رمز خالی را هش کند (بدون crash)', async () => {
    const hashed = await securityService.hashCredential('');
    const valid = await securityService.verifyCredential('', hashed);
    expect(valid).toBe(true);
  });
});

describe('Security — رمزگذاری AES-GCM', () => {
  it('باید داده رمزگذاری و رمزگشایی شود', async () => {
    const plaintext = 'اطلاعات حساس تست';
    const password = 'EncryptionKey123';
    const encrypted = await securityService.encrypt(plaintext, password);
    const decrypted = await securityService.decrypt(encrypted, password);
    expect(decrypted).toBe(plaintext);
  });

  it('رمزگذاری‌شده نباید شامل متن اصلی باشد', async () => {
    const plaintext = 'SecretData123';
    const encrypted = await securityService.encrypt(plaintext, 'password');
    expect(encrypted).not.toContain(plaintext);
  });

  it('باید با رمز عبور اشتباه خطا بدهد', async () => {
    const encrypted = await securityService.encrypt('test data', 'correct-pass');
    await expect(
      securityService.decrypt(encrypted, 'wrong-pass')
    ).rejects.toThrow();
  });

  it('دو رمزگذاری از یک متن باید متفاوت باشند (IV تصادفی)', async () => {
    const plaintext = 'Same Text';
    const enc1 = await securityService.encrypt(plaintext, 'pass');
    const enc2 = await securityService.encrypt(plaintext, 'pass');
    expect(enc1).not.toBe(enc2);
    // هر دو باید به درستی رمزگشایی شوند
    expect(await securityService.decrypt(enc1, 'pass')).toBe(plaintext);
    expect(await securityService.decrypt(enc2, 'pass')).toBe(plaintext);
  });
});

describe('Security — Checksum یکپارچگی', () => {
  it('باید SHA-256 ثابت باشد', async () => {
    const data = 'test data for checksum';
    const h1 = await securityService.sha256(data);
    const h2 = await securityService.sha256(data);
    expect(h1).toBe(h2);
  });

  it('باید هر تغییر در داده را شناسایی کند', async () => {
    const original = 'data';
    const tampered = 'data!';
    const h1 = await securityService.sha256(original);
    const h2 = await securityService.sha256(tampered);
    expect(h1).not.toBe(h2);
  });

  it('باید خروجی hex معتبر باشد', async () => {
    const hash = await securityService.sha256('test');
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    expect(hash.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
  });
});
