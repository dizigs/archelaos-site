/**
 * ARCHELAOS — read-only current-account trigger inventory.
 *
 * This source can be added as a NEW .gs file in the EXISTING private Apps
 * Script project. It does not create/delete/edit triggers, code, or settings.
 *
 * IMPORTANT: ScriptApp.getProjectTriggers() sees installable triggers for
 * the CURRENT execution account, not necessarily those created by other
 * accounts. Therefore its fingerprint is evidence, NOT proof of the complete
 * project-wide trigger inventory or exclusive-writer status.
 *
 * Running this function may require Google's script.scriptapp authorization
 * for the executing Apps Script account. Never silently add this scope to
 * appsscript.json or claim it is already granted to the Worker.
 */
function archelaosTriggerInventoryV1() {
  'use strict';
  var items = ScriptApp.getProjectTriggers();
  if (!Array.isArray(items) || items.length > 512) {
    throw new Error('TRIGGER_INVENTORY_BOUNDS_UNVERIFIED');
  }

  var rows = items.map(function (trigger) {
    // Never return trigger IDs, calendar/source IDs, email addresses,
    // script-property values, OAuth tokens, or external API credentials.
    var handler = trigger.getHandlerFunction();
    if (typeof handler !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(handler)) {
      throw new Error('TRIGGER_HANDLER_NAME_UNVERIFIED');
    }
    var eventType = String(trigger.getEventType());
    var sourceType = String(trigger.getTriggerSource());
    if (!/^[A-Z_]{1,40}$/.test(eventType) || !/^[A-Z_]{1,40}$/.test(sourceType)) {
      throw new Error('TRIGGER_CLASSIFICATION_UNVERIFIED');
    }
    return { handler: handler, eventType: eventType, sourceType: sourceType };
  });

  rows.sort(function (a, b) {
    var left = a.handler + '\u0000' + a.eventType + '\u0000' + a.sourceType;
    var right = b.handler + '\u0000' + b.eventType + '\u0000' + b.sourceType;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(rows),
    Utilities.Charset.UTF_8
  );
  if (!Array.isArray(digest) || digest.length !== 32) {
    throw new Error('TRIGGER_FINGERPRINT_UNVERIFIED');
  }
  var fingerprint = digest.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');

  return {
    status: 'PARTIAL_TRIGGER_INVENTORY_READONLY',
    scope: 'CURRENT_EXECUTION_ACCOUNT_ONLY',
    completeProjectInventory: false,
    triggerCount: rows.length,
    fingerprintSha256: fingerprint,
    triggers: rows,
    writesPerformed: false
  };
}
