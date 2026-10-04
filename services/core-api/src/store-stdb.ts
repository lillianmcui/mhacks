import {
  connect,
  fromAsset,
  fromContact,
  fromEscalationPolicy,
  fromMethaneEventInput,
  fromProviderSource,
  toAcknowledgement,
  toAction,
  toAlert,
  toAsset,
  toContact,
  toEscalationPolicy,
  toIncident,
  toMethaneEvent,
  toProviderSource,
  type ConnectOptions,
  type DbConnection,
} from '@ch4se/stdb-bindings';
import { fromReducerError } from './errors.ts';
import type { Store } from './store.ts';

const orUndefined = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

async function call(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    throw fromReducerError(error);
  }
}

/** Store backed by a live SpacetimeDB connection subscribed to every table. */
export async function connectStdbStore(options: ConnectOptions): Promise<Store> {
  const conn: DbConnection = await connect(options);
  const { db, reducers } = conn;
  return {
    events: () => [...db.methaneEvent.iter()].map(toMethaneEvent),
    providerSources: () => [...db.providerSource.iter()].map(toProviderSource),
    assets: () => [...db.asset.iter()].map(toAsset),
    contacts: () => [...db.contact.iter()].map(toContact),
    policies: () => [...db.escalationPolicy.iter()].map(toEscalationPolicy),
    incidents: () => [...db.incident.iter()].map(toIncident),
    alerts: () => [...db.alert.iter()].map(toAlert),
    acknowledgements: () => [...db.acknowledgement.iter()].map(toAcknowledgement),
    actions: () => [...db.action.iter()].map(toAction),

    seedAssets: assets => call(() => reducers.seedAssets({ assets: assets.map(fromAsset) })),
    seedContacts: contacts => call(() => reducers.seedContacts({ contacts: contacts.map(fromContact) })),
    seedPolicies: policies => call(() => reducers.seedPolicies({ policies: policies.map(fromEscalationPolicy) })),
    insertEvent: (event, source) =>
      call(() =>
        reducers.insertEvent({
          event: fromMethaneEventInput(event),
          source: source ? fromProviderSource(source) : undefined,
        })
      ),
    createIncident: input =>
      call(() =>
        reducers.createIncident({
          eventId: input.event_id,
          matchResult: input.match_result,
          assetId: orUndefined(input.asset_id),
          distanceM: orUndefined(input.distance_m),
          candidates: input.candidates.map(c => ({ assetId: c.asset_id, distanceM: c.distance_m })),
          priority: input.priority,
          policyId: input.policy_id,
          policyRuleId: input.policy_rule_id,
          assignedContactId: orUndefined(input.assigned_contact_id),
        })
      ),
    setIncidentStatus: input =>
      call(() =>
        reducers.setIncidentStatus({
          incidentId: input.incident_id,
          status: input.status,
          actor: input.actor,
          note: orUndefined(input.note),
        })
      ),
    acknowledgeIncident: input =>
      call(() =>
        reducers.acknowledgeIncident({
          incidentId: input.incident_id,
          contactId: input.contact_id,
          channel: input.channel,
          actor: input.actor,
        })
      ),
    recordAlert: input =>
      call(() =>
        reducers.recordAlert({
          alertId: input.alert_id,
          incidentId: input.incident_id,
          contactId: input.contact_id,
          channel: input.channel,
          deliveryStatus: input.delivery_status,
          messageText: input.message_text,
          briefingSource: input.briefing_source,
          actor: input.actor,
        })
      ),
    recordAction: input =>
      call(() =>
        reducers.recordAction({
          actionId: input.action_id,
          incidentId: input.incident_id,
          actor: input.actor,
          actionName: input.action_name,
          detail: input.detail,
        })
      ),

    close: () => conn.disconnect(),
  };
}
