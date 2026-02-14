/**
 * IPFS Storage Service
 * Handles incident attachments (logs, screenshots, videos) on IPFS
 * Provides decentralized, immutable storage for evidence
 */

const IPFS = require('ipfs-http-client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');

class IPFSStorageService {
  constructor(options = {}) {
    this.host = options.host || process.env.IPFS_HOST || 'localhost';
    this.port = options.port || process.env.IPFS_PORT || 5001;
    this.protocol = options.protocol || process.env.IPFS_PROTOCOL || 'http';

    this.client = IPFS.create({
      host: this.host,
      port: this.port,
      protocol: this.protocol,
    });

    // Gateway for public access
    this.gatewayUrl = options.gatewayUrl || process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs';

    // Local cache for uploaded files
    this.uploadCache = new Map();

    // Storage limits
    this.maxFileSize = options.maxFileSize || 100 * 1024 * 1024; // 100 MB
    this.allowedMimeTypes = [
      'text/plain',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/gif',
      'video/mp4',
      'video/webm',
      'application/pdf',
      'application/zip',
    ];

    this.stats = {
      uploaded: 0,
      retrieved: 0,
      errors: 0,
      totalBytes: 0,
    };
  }

  /**
   * Upload file to IPFS
   */
  async uploadFile(filePath, metadata = {}) {
    try {
      // Validate file
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes (max ${this.maxFileSize})`);
      }

      const fileContent = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const mimeType = this.getMimeType(filePath);

      // Create IPFS file with metadata
      const ipfsFile = {
        path: fileName,
        content: fileContent,
      };

      // Upload to IPFS
      const ipfs = await this.client;
      const result = await ipfs.add(ipfsFile, {
        progress: (prog) => {
          console.log(`Uploading: ${prog} bytes`);
        },
      });

      const ipfsHash = result.cid.toString();

      // Store metadata
      await this.storeMetadata(ipfsHash, {
        fileName,
        fileSize: stats.size,
        mimeType,
        uploadTime: Date.now(),
        ...metadata,
      });

      this.uploadCache.set(ipfsHash, {
        filePath,
        stats,
        metadata,
      });

      this.stats.uploaded++;
      this.stats.totalBytes += stats.size;

      console.log(chalk.green(`✓ Uploaded ${fileName} to IPFS: ${ipfsHash}`));

      return {
        ipfsHash,
        url: `${this.gatewayUrl}/${ipfsHash}`,
        fileName,
        size: stats.size,
        mimeType,
      };
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Failed to upload to IPFS:'), err.message);
      throw err;
    }
  }

  /**
   * Upload raw buffer to IPFS
   */
  async uploadBuffer(buffer, fileName, metadata = {}) {
    try {
      if (buffer.length > this.maxFileSize) {
        throw new Error(`Buffer too large: ${buffer.length} bytes`);
      }

      const ipfsFile = {
        path: fileName,
        content: buffer,
      };

      const ipfs = await this.client;
      const result = await ipfs.add(ipfsFile);
      const ipfsHash = result.cid.toString();

      const mimeType = this.getMimeType(fileName);

      await this.storeMetadata(ipfsHash, {
        fileName,
        fileSize: buffer.length,
        mimeType,
        uploadTime: Date.now(),
        ...metadata,
      });

      this.stats.uploaded++;
      this.stats.totalBytes += buffer.length;

      return {
        ipfsHash,
        url: `${this.gatewayUrl}/${ipfsHash}`,
        fileName,
        size: buffer.length,
        mimeType,
      };
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Failed to upload buffer to IPFS:'), err.message);
      throw err;
    }
  }

  /**
   * Upload incident evidence package
   */
  async uploadIncidentEvidence(incidentId, evidence = {}) {
    try {
      const evidencePackage = {
        incidentId,
        uploadedAt: new Date().toISOString(),
        items: [],
      };

      // Upload each evidence item
      for (const [key, value] of Object.entries(evidence)) {
        let ipfsHash;

        if (value instanceof Buffer) {
          const result = await this.uploadBuffer(
            value,
            `incident-${incidentId}-${key}`,
            { incidentId, type: key }
          );
          ipfsHash = result.ipfsHash;
        } else if (typeof value === 'string' && fs.existsSync(value)) {
          const result = await this.uploadFile(value, { incidentId, type: key });
          ipfsHash = result.ipfsHash;
        } else if (typeof value === 'object') {
          const jsonBuffer = Buffer.from(JSON.stringify(value, null, 2));
          const result = await this.uploadBuffer(
            jsonBuffer,
            `incident-${incidentId}-${key}.json`,
            { incidentId, type: key, format: 'json' }
          );
          ipfsHash = result.ipfsHash;
        }

        if (ipfsHash) {
          evidencePackage.items.push({
            type: key,
            ipfsHash,
            url: `${this.gatewayUrl}/${ipfsHash}`,
          });
        }
      }

      // Upload complete package manifest
      const manifestBuffer = Buffer.from(JSON.stringify(evidencePackage, null, 2));
      const manifestResult = await this.uploadBuffer(
        manifestBuffer,
        `incident-${incidentId}-manifest.json`,
        { incidentId, type: 'manifest' }
      );

      console.log(chalk.green(`✓ Uploaded evidence package for incident ${incidentId}`));

      return {
        incidentId,
        manifestHash: manifestResult.ipfsHash,
        manifestUrl: manifestResult.url,
        items: evidencePackage.items,
      };
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Failed to upload incident evidence:'), err.message);
      throw err;
    }
  }

  /**
   * Retrieve file from IPFS
   */
  async retrieveFile(ipfsHash) {
    try {
      // Check cache first
      if (this.uploadCache.has(ipfsHash)) {
        return this.uploadCache.get(ipfsHash);
      }

      const ipfs = await this.client;
      const chunks = [];

      for await (const chunk of ipfs.cat(ipfsHash)) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      this.stats.retrieved++;

      return buffer;
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Failed to retrieve from IPFS:'), err.message);
      throw err;
    }
  }

  /**
   * Retrieve incident evidence manifest
   */
  async getIncidentEvidence(manifestHash) {
    try {
      const manifestBuffer = await this.retrieveFile(manifestHash);
      const manifest = JSON.parse(manifestBuffer.toString());

      // Build complete evidence package with metadata
      const evidence = {
        manifest,
        items: [],
      };

      for (const item of manifest.items) {
        try {
          const fileBuffer = await this.retrieveFile(item.ipfsHash);
          evidence.items.push({
            ...item,
            content: fileBuffer,
            size: fileBuffer.length,
          });
        } catch (err) {
          console.warn(`Failed to retrieve evidence item ${item.ipfsHash}:`, err.message);
        }
      }

      return evidence;
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Failed to get incident evidence:'), err.message);
      throw err;
    }
  }

  /**
   * Store file metadata in local index
   */
  async storeMetadata(ipfsHash, metadata) {
    try {
      const metaPath = path.join(process.env.IPFS_META_DIR || './ipfs-metadata', `${ipfsHash}.json`);
      const metaDir = path.dirname(metaPath);

      if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
      }

      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    } catch (err) {
      console.warn('Failed to store IPFS metadata:', err.message);
    }
  }

  /**
   * Get file MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const mimeMap = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.log': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Pin file to ensure persistence
   */
  async pinFile(ipfsHash) {
    try {
      const ipfs = await this.client;
      await ipfs.pin.add(ipfsHash);
      console.log(chalk.green(`✓ Pinned ${ipfsHash} to local IPFS node`));
      return true;
    } catch (err) {
      console.error(chalk.red('Failed to pin file:'), err.message);
      return false;
    }
  }

  /**
   * Get IPFS node stats
   */
  async getNodeStats() {
    try {
      const ipfs = await this.client;
      const stats = await ipfs.stats.bw();
      const repoStats = await ipfs.repo.stat();

      return {
        bandwidth: stats,
        storage: repoStats,
        uploadStats: this.stats,
      };
    } catch (err) {
      console.error(chalk.red('Failed to get node stats:'), err.message);
      return null;
    }
  }

  /**
   * Clean up old cached metadata
   */
  async cleanup(olderThanDays = 30) {
    try {
      const metaDir = process.env.IPFS_META_DIR || './ipfs-metadata';
      if (!fs.existsSync(metaDir)) {
        return 0;
      }

      const now = Date.now();
      const maxAge = olderThanDays * 24 * 60 * 60 * 1000;
      let deleted = 0;

      const files = fs.readdirSync(metaDir);
      for (const file of files) {
        const filePath = path.join(metaDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }

      console.log(chalk.green(`✓ Cleaned up ${deleted} old IPFS metadata files`));
      return deleted;
    } catch (err) {
      console.error(chalk.red('Cleanup failed:'), err.message);
      return 0;
    }
  }

  /**
   * Get storage stats
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.uploadCache.size,
      avgFileSize: this.stats.uploaded > 0
        ? (this.stats.totalBytes / this.stats.uploaded / 1024).toFixed(2) + ' KB'
        : 'N/A',
    };
  }
}

module.exports = IPFSStorageService;
