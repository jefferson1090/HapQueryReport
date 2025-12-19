import CryptoJS from 'crypto-js';

const SECRET_KEY = 'hap-query-report-secret-key';

export const encryptPassword = (password) => {
    if (!password) return '';
    return CryptoJS.AES.encrypt(password, SECRET_KEY).toString();
};

export const decryptPassword = (ciphertext) => {
    if (!ciphertext) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText || ciphertext;
    } catch (e) {
        return ciphertext;
    }
};
