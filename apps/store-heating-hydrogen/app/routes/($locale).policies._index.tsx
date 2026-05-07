import {useLoaderData, Link, useParams} from 'react-router';
import type {Route} from './+types/policies._index';
import type {PoliciesQuery, PolicyItemFragment} from 'storefrontapi.generated';
import {DEFAULT_LOCALE, isSupportedLocale, useT} from '~/lib/gberg/i18n';
import {localeHref} from '~/lib/gberg/href';
import {BRAND_NAME, buildSeoMeta} from '~/lib/gberg/seo';

export const meta: Route.MetaFunction = ({
  location,
}: {
  location: {pathname: string};
}) => {
  const title = `Store policies — ${BRAND_NAME}`;
  const description =
    'Privacy policy, terms of service, shipping and refund policies for G-Berg Heizung.';
  return [
    {title},
    {name: 'description', content: description},
    ...buildSeoMeta({
      title,
      description,
      pathname: location.pathname,
      type: 'website',
    }),
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  const data: PoliciesQuery = await context.storefront.query(POLICIES_QUERY);

  const shopPolicies = data.shop;
  const policies: PolicyItemFragment[] = [
    shopPolicies?.privacyPolicy,
    shopPolicies?.shippingPolicy,
    shopPolicies?.termsOfService,
    shopPolicies?.refundPolicy,
    shopPolicies?.subscriptionPolicy,
  ].filter((policy): policy is PolicyItemFragment => policy != null);

  if (!policies.length) {
    throw new Response('No policies found', {status: 404});
  }

  return {policies};
}

export default function Policies() {
  const {policies} = useLoaderData<typeof loader>();
  const t = useT();
  const params = useParams();
  const rawLocale = (params as {locale?: string}).locale;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  return (
    <div className="policies">
      <h1>{t('policies.title')}</h1>
      <div>
        {policies.map((policy) => (
          <fieldset key={policy.id}>
            <Link to={localeHref(locale, `/policies/${policy.handle}`)}>{policy.title}</Link>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

const POLICIES_QUERY = `#graphql
  fragment PolicyItem on ShopPolicy {
    id
    title
    handle
  }
  query Policies ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    shop {
      privacyPolicy {
        ...PolicyItem
      }
      shippingPolicy {
        ...PolicyItem
      }
      termsOfService {
        ...PolicyItem
      }
      refundPolicy {
        ...PolicyItem
      }
      subscriptionPolicy {
        id
        title
        handle
      }
    }
  }
` as const;
