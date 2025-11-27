import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface NeurcodeConfig {
  apiUrl?: string;
  apiKey?: string;
  projectId?: string;
}

/**
 * Load configuration from neurcode.config.json or environment variables
 */
export function loadConfig(): NeurcodeConfig {
  const config: NeurcodeConfig = {};

  // Try to load from config file
  const configPaths = [
    join(process.cwd(), 'neurcode.config.json'),
    join(process.cwd(), '.neurcode.json'),
    join(process.env.HOME || '', '.neurcode.json')
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf-8');
        const fileConfig = JSON.parse(fileContent);
        Object.assign(config, fileConfig);
        break;
      } catch (error) {
        // Ignore parse errors, fall through to env vars
      }
    }
  }

  // Override with environment variables
  if (process.env.NEURCODE_API_URL) {
    config.apiUrl = process.env.NEURCODE_API_URL;
  }
  if (process.env.NEURCODE_API_KEY) {
    config.apiKey = process.env.NEURCODE_API_KEY;
  }
  if (process.env.NEURCODE_PROJECT_ID) {
    config.projectId = process.env.NEURCODE_PROJECT_ID;
  }

  return config;
}

