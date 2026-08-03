import { UPDATE_CHECK_URL } from '../../shared/domain/types';
import * as https from 'https';

interface GitHubRelease {
  tag_name: string;
}

export function checkForUpdates(): Promise<{ updateAvailable: boolean; latestVersion?: string; downloadUrl?: string }> {
  return new Promise((resolve, _reject) => {
    const url = new URL(UPDATE_CHECK_URL);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'SaveYourData',
        Accept: 'application/vnd.github+json',
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 403 || res.statusCode === 429) {
        // Rate limited, skip
        return resolve({ updateAvailable: false });
      }

      if (res.statusCode !== 200) {
        return resolve({ updateAvailable: false });
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const release: GitHubRelease = JSON.parse(data);
          const remoteVersion = normalizeVersion(release.tag_name);
          const localVersion = normalizeVersion('0.1.0');

          if (compareVersions(remoteVersion, localVersion) > 0) {
            resolve({
              updateAvailable: true,
              latestVersion: release.tag_name,
              downloadUrl: `https://github.com/vynofc/SaveYourDocuments/releases/download/${release.tag_name}/SaveYourData-Setup.exe`,
            });
          } else {
            resolve({ updateAvailable: false });
          }
        } catch {
          resolve({ updateAvailable: false });
        }
      });
    });

    req.on('error', () => resolve({ updateAvailable: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ updateAvailable: false });
    });

    req.end();
  });
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/, '').replace(/!beta$/, '');
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}