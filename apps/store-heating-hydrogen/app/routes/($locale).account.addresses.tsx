import {Form, useActionData, useNavigation, useOutletContext} from 'react-router';
import type {Route} from './+types/($locale).account.addresses';
import {
  CREATE_ADDRESS_MUTATION,
  DELETE_ADDRESS_MUTATION,
  UPDATE_ADDRESS_MUTATION,
} from '~/graphql/customer-account/CustomerAddressMutations';
import {useT} from '~/lib/gberg/i18n';

type ActionResult =
  | {ok: 'create' | 'update' | 'delete'}
  | {error: string};

export async function loader({context}: Route.LoaderArgs) {
  await context.customerAccount.handleAuthStatus();
  return {};
}

export async function action({request, context}: Route.ActionArgs): Promise<ActionResult> {
  await context.customerAccount.handleAuthStatus();
  const fd = await request.formData();
  const intent = String(fd.get('intent') || '');

  const buildAddress = () => ({
    firstName: (fd.get('firstName') as string)?.trim() || undefined,
    lastName: (fd.get('lastName') as string)?.trim() || undefined,
    company: (fd.get('company') as string)?.trim() || undefined,
    address1: (fd.get('address1') as string)?.trim() || undefined,
    address2: (fd.get('address2') as string)?.trim() || undefined,
    city: (fd.get('city') as string)?.trim() || undefined,
    zip: (fd.get('zip') as string)?.trim() || undefined,
    territoryCode: (fd.get('territoryCode') as string)?.trim() || undefined,
    zoneCode: (fd.get('zoneCode') as string)?.trim() || undefined,
    phoneNumber: (fd.get('phoneNumber') as string)?.trim() || undefined,
  });

  if (intent === 'create') {
    const {data, errors} = await context.customerAccount.mutate(CREATE_ADDRESS_MUTATION, {
      variables: {
        address: buildAddress(),
        defaultAddress: fd.get('default') === 'on',
        language: context.customerAccount.i18n?.language,
      },
    });
    const ue = data?.customerAddressCreate?.userErrors ?? [];
    if (errors?.length || ue.length) return {error: ue[0]?.message ?? errors?.[0]?.message};
    return {ok: 'create'};
  }

  if (intent === 'update') {
    const addressId = String(fd.get('addressId') || '');
    if (!addressId) return {error: 'Missing address id'};
    const {data, errors} = await context.customerAccount.mutate(UPDATE_ADDRESS_MUTATION, {
      variables: {
        address: buildAddress(),
        addressId,
        defaultAddress: fd.get('default') === 'on',
        language: context.customerAccount.i18n?.language,
      },
    });
    const ue = data?.customerAddressUpdate?.userErrors ?? [];
    if (errors?.length || ue.length) return {error: ue[0]?.message ?? errors?.[0]?.message};
    return {ok: 'update'};
  }

  if (intent === 'delete') {
    const addressId = String(fd.get('addressId') || '');
    if (!addressId) return {error: 'Missing address id'};
    const {data, errors} = await context.customerAccount.mutate(DELETE_ADDRESS_MUTATION, {
      variables: {addressId},
    });
    const ue = data?.customerAddressDelete?.userErrors ?? [];
    if (errors?.length || ue.length) return {error: ue[0]?.message ?? errors?.[0]?.message};
    return {ok: 'delete'};
  }

  return {error: 'Unknown intent'};
}

interface OutletCtx {
  customer: {
    defaultAddress?: {id: string} | null;
    addresses?: {nodes: Array<any>};
  };
}

export default function AccountAddresses() {
  const {customer} = useOutletContext<OutletCtx>();
  const action = useActionData<ActionResult>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const t = useT();
  const defaultId = customer.defaultAddress?.id;
  const addresses = customer.addresses?.nodes ?? [];

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">{t('account.addresses_heading')}</h2>

      {action && 'ok' in action ? (
        <p className="text-sm text-[var(--color-success,#0F7A34)]" role="status">
          {t('account.addresses_saved')}
        </p>
      ) : null}
      {action && 'error' in action && action.error ? (
        <p className="text-sm text-[var(--color-primary)]" role="alert">{action.error}</p>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {addresses.map((a: any) => (
          <li key={a.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                {a.id === defaultId ? (
                  <span className="inline-block text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-primary)] mb-1">
                    {t('account.addresses_default_badge')}
                  </span>
                ) : null}
                <address className="not-italic text-sm whitespace-pre-line">
                  {(a.formatted ?? []).join('\n')}
                </address>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="addressId" value={a.id} />
                <button type="submit" disabled={submitting}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                  {t('account.addresses_delete')}
                </button>
              </Form>
            </div>
          </li>
        ))}
      </ul>

      <details className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          + {t('account.addresses_add_new')}
        </summary>
        <Form method="post" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="intent" value="create" />
          <Field name="firstName" label={t('account.profile_first_name')} />
          <Field name="lastName" label={t('account.profile_last_name')} />
          <Field name="company" label={t('account.addresses_company')} />
          <Field name="phoneNumber" label={t('account.addresses_phone')} />
          <Field name="address1" label={t('account.addresses_address1')} required />
          <Field name="address2" label={t('account.addresses_address2')} />
          <Field name="city" label={t('account.addresses_city')} required />
          <Field name="zip" label={t('account.addresses_zip')} required />
          <Field name="territoryCode" label={t('account.addresses_country_code')} required maxLength={2}
            placeholder="DE" />
          <Field name="zoneCode" label={t('account.addresses_zone_code')} placeholder="BY" />
          <label className="col-span-full inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="default" /> {t('account.addresses_set_default')}
          </label>
          <button type="submit" disabled={submitting}
            className="col-span-full inline-flex justify-center px-6 py-3 bg-[var(--color-cta,#111)] text-white text-sm font-semibold uppercase tracking-[0.06em] rounded-sm hover:bg-[var(--color-cta-hover,#000)] disabled:opacity-50">
            {submitting ? t('account.addresses_saving') : t('account.addresses_save')}
          </button>
        </Form>
      </details>
    </div>
  );
}

function Field({name, label, required, maxLength, placeholder}: {
  name: string; label: string; required?: boolean; maxLength?: number; placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium mb-1">{label}</label>
      <input id={name} name={name} type="text" required={required} maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]" />
    </div>
  );
}
