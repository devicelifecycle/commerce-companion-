/**
 * Schema Validator — Future-proofing utility for marketplace API responses.
 *
 * Checks incoming API payloads against expected field signatures.
 * If critical fields are missing or new unknown fields appear,
 * it logs a system_alert so admins see a banner on the Home page.
 */

interface FieldSpec {
  path: string;        // dot-separated path e.g. "customer.shipping_address.state"
  required: boolean;   // if true, missing = critical alert
  type?: string;       // expected typeof (optional)
}

interface SchemaValidationResult {
  missingRequired: string[];
  missingOptional: string[];
  unexpectedFields: string[];
  valid: boolean;
}

function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function getTopLevelKeys(obj: any, prefix = ''): string[] {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getTopLevelKeys(obj[key], fullKey));
    }
  }
  return keys;
}

export function validateSchema(
  payload: any,
  expectedFields: FieldSpec[],
  knownFieldPaths: string[],
): SchemaValidationResult {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const field of expectedFields) {
    const value = getNestedValue(payload, field.path);
    if (value === undefined || value === null) {
      if (field.required) {
        missingRequired.push(field.path);
      } else {
        missingOptional.push(field.path);
      }
    } else if (field.type && typeof value !== field.type) {
      // Type mismatch on a required field = treat as missing
      if (field.required) {
        missingRequired.push(`${field.path} (expected ${field.type}, got ${typeof value})`);
      }
    }
  }

  // Detect unexpected top-level fields
  const actualFields = getTopLevelKeys(payload);
  const knownSet = new Set(knownFieldPaths);
  const unexpectedFields = actualFields.filter(f => !knownSet.has(f));

  return {
    missingRequired,
    missingOptional,
    unexpectedFields,
    valid: missingRequired.length === 0 && unexpectedFields.length === 0,
  };
}

/**
 * Inserts a system alert if schema validation fails.
 * De-duplicates by checking for existing non-dismissed alerts of the same type+source.
 */
export async function raiseSchemaAlert(
  supabase: any,
  source: string,
  result: SchemaValidationResult,
  samplePayloadKeys: string[],
) {
  if (result.valid) return;

  const isCritical = result.missingRequired.length > 0;
  const severity = isCritical ? 'critical' : 'warning';
  const alertType = 'api_schema_change';

  // Check if we already have an active alert for this source
  const { data: existing } = await supabase
    .from('system_alerts')
    .select('id')
    .eq('alert_type', alertType)
    .eq('source', source)
    .eq('is_dismissed', false)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update existing alert with latest details
    await supabase
      .from('system_alerts')
      .update({
        severity,
        message: buildMessage(source, result),
        details: {
          missing_required: result.missingRequired,
          missing_optional: result.missingOptional,
          unexpected_fields: result.unexpectedFields,
          sample_keys: samplePayloadKeys,
          detected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing[0].id);
    return;
  }

  // Insert new alert
  await supabase
    .from('system_alerts')
    .insert({
      alert_type: alertType,
      severity,
      source,
      title: isCritical
        ? `🚨 ${source} API: Critical fields missing`
        : `⚠️ ${source} API: Schema change detected`,
      message: buildMessage(source, result),
      details: {
        missing_required: result.missingRequired,
        missing_optional: result.missingOptional,
        unexpected_fields: result.unexpectedFields,
        sample_keys: samplePayloadKeys,
        detected_at: new Date().toISOString(),
      },
    });
}

function buildMessage(source: string, result: SchemaValidationResult): string {
  const parts: string[] = [];
  if (result.missingRequired.length > 0) {
    parts.push(`Critical fields missing from ${source} API response: ${result.missingRequired.join(', ')}. Orders may be imported with incomplete data.`);
  }
  if (result.unexpectedFields.length > 0) {
    parts.push(`New unexpected fields detected in ${source} API: ${result.unexpectedFields.slice(0, 10).join(', ')}${result.unexpectedFields.length > 10 ? ` (+${result.unexpectedFields.length - 10} more)` : ''}. The API may have changed — review and update the import logic.`);
  }
  return parts.join(' ');
}
