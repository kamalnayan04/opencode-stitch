
import { RobustnessConfig } from './robustness/types';
import { RecoveryConfig } from './recovery/types';
import { AGGRESSIVE_RECOVERY, CONSERVATIVE_RECOVERY } from './recovery/config';

export interface ProviderConfig {
  robustness: RobustnessConfig;
  recovery: RecoveryConfig;
  debug: boolean;
}

export function loadConfig(): ProviderConfig {
  return {
    robustness: {
      validation: {
        enabled: process.env.STITCH_VALIDATION !== 'false',
        strictMode: process.env.STITCH_VALIDATION_STRICT === 'true'
      },
      sanitization: {
        maxContentLength: parseInt(process.env.STITCH_MAX_CONTENT || '1048576'),
        maxChoices: parseInt(process.env.STITCH_MAX_CHOICES || '10'),
        allowedContentTypes: new Set(['CONTENT_TYPE_TEXT', 'CONTENT_TYPE_REASONING']),
        truncateOverflow: true
      },
      fallbacks: {
        enabled: true,
        userFriendlyMessages: true,
        includeErrorDetails: process.env.NODE_ENV === 'development'
      },
      telemetry: {
        enabled: process.env.STITCH_TELEMETRY !== 'false',
        maxEvents: 1000,
        exportInterval: 60000
      }
    },
    recovery: process.env.NODE_ENV === 'production'
      ? CONSERVATIVE_RECOVERY
      : AGGRESSIVE_RECOVERY,
    debug: process.env.STITCH_DEBUG === 'true'
  };
}
