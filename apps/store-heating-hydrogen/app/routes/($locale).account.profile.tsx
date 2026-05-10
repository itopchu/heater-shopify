import {Form, useActionData, useNavigation, useOutletContext} from 'react-router';
import type {Route} from './+types/($locale).account.profile';
import {CUSTOMER_UPDATE_MUTATION} from '~/graphql/customer-account/CustomerUpdateMutation';
import {useT} from '~/lib/gberg/i18n';

type ActionResult = {ok: true} | {error: string};

export async function loader({context}: Route.LoaderArgs) {
  await context.customerAccount.handleAuthStatus();
  return {};
}

export async function action({request, context}: Route.ActionArgs): Promise<ActionResult> {
  await context.customerAccount.handleAuthStatus();
  const fd = await request.formData();
  const customer = {
    firstName: (fd.get('firstName') as string)?.trim() || undefined,
    lastName: (fd.get('lastName') as string)?.trim() || undefined,
  };
  const {data, errors} = await context.customerAccount.query(CUSTOMER_UPDATE_MUTATION, {
    variables: {customer},
  });
  const userErrors = data?.customerUpdate?.userErrors ?? [];
  if (errors?.length || userErrors.length) {
    return {error: userErrors[0]?.message ?? errors?.[0]?.message ?? 'Update failed'};
  }
  return {ok: true};
}

interface OutletCtx {
  customer: {firstName?: string | null; lastName?: string | null};
}

export default function AccountProfile() {
  const {customer} = useOutletContext<OutletCtx>();
  const action = useActionData<ActionResult>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const t = useT();

  const inputCls =
    'w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]';

  return (
    <div className="max-w-md space-y-6">
      <h2 className="text-lg font-semibold">{t('account.profile_heading')}</h2>
      <p className="text-sm text-[var(--color-text-muted)]">{t('account.profile_blurb')}</p>

      <Form method="post" className="space-y-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium mb-1">
            {t('account.profile_first_name')}
          </label>
          <input id="firstName" name="firstName" type="text"
            defaultValue={customer.firstName ?? ''} className={inputCls} />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium mb-1">
            {t('account.profile_last_name')}
          </label>
          <input id="lastName" name="lastName" type="text"
            defaultValue={customer.lastName ?? ''} className={inputCls} />
        </div>

        {action && 'ok' in action && action.ok ? (
          <p className="text-sm text-[var(--color-success,#0F7A34)]" role="status">
            {t('account.profile_saved')}
          </p>
        ) : null}
        {action && 'error' in action && action.error ? (
          <p className="text-sm text-[var(--color-primary)]" role="alert">{action.error}</p>
        ) : null}

        <button type="submit" disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-cta,#111)] text-white text-sm font-semibold uppercase tracking-[0.06em] rounded-sm transition-colors hover:bg-[var(--color-cta-hover,#000)] disabled:opacity-50">
          {submitting ? t('account.profile_saving') : t('account.profile_save')}
        </button>
      </Form>
    </div>
  );
}
