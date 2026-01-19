import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AgentConfig } from '../types';

/**
 * Load external configuration from multiple possible paths
 * Priority: userData > resourcesPath > project root
 */
export function loadExternalConfig(): Partial<AgentConfig> {
  const configPaths = [
    path.join(app.getPath('userData'), 'config.json'),
    path.join(process.resourcesPath || '', 'config.json'),
    path.join(__dirname, '../../../config.json'),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData);
        console.log(`[Config] Loaded from: ${configPath}`);
        return config;
      }
    } catch (err) {
      console.warn(`[Config] Failed to load from ${configPath}:`, err);
    }
  }

  return {};
}

/**
 * Get the path to assets directory
 */
export function getAssetsPath(): string {
  return path.join(__dirname, '../../assets');
}

/**
 * Get path to a specific asset file
 */
export function getAssetPath(filename: string): string {
  return path.join(getAssetsPath(), filename);
}
