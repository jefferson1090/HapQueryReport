const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const os = require('os');

class DataBackupService {
    constructor() {
        // Source: AppData/HapAssistenteDeDados
        const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        this.sourceDir = path.join(appData, 'HapAssistenteDeDados');

        // Destination: Documents/HapBackups
        this.backupDir = path.join(os.homedir(), 'Documents', 'HapBackups');

        if (!fs.existsSync(this.backupDir)) {
            try {
                fs.mkdirSync(this.backupDir, { recursive: true });
            } catch (e) {
                console.error('[DataBackupService] Failed to create backup dir:', e);
            }
        }
    }

    /**
     * Creates a zip backup of the entire data directory.
     * @returns {Promise<string>} Path to the created zip file.
     */
    async createBackup(version = 'unknown') {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(this.sourceDir)) {
                console.warn('[DataBackupService] Source directory does not exist. Skipping backup.');
                return resolve(null);
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `backup_v${version}_${timestamp}.zip`;
            const outputPath = path.join(this.backupDir, fileName);

            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Sets the compression level.
            });

            output.on('close', function () {
                console.log(`[DataBackupService] Backup created: ${outputPath} (${archive.pointer()} total bytes)`);
                resolve(outputPath);
            });

            archive.on('warning', function (err) {
                if (err.code === 'ENOENT') {
                    console.warn('[DataBackupService] Warning:', err);
                } else {
                    reject(err);
                }
            });

            archive.on('error', function (err) {
                reject(err);
            });

            archive.pipe(output);

            // Append all files from source directory
            archive.directory(this.sourceDir, false);

            archive.finalize();
        });
    }
}

module.exports = new DataBackupService();
