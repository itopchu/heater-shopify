import {Link, useLoaderData, useParams} from 'react-router';
import type {Route} from './+types/policies.$handle';
import {type Shop} from '@shopify/hydrogen/storefront-api-types';
import {DEFAULT_LOCALE, isSupportedLocale} from '~/lib/gberg/i18n';
import {localeHref} from '~/lib/gberg/href';
import {BRAND_NAME, buildSeoMeta} from '~/lib/gberg/seo';

type SelectedPolicies = keyof Pick<
  Shop,
  'privacyPolicy' | 'shippingPolicy' | 'termsOfService' | 'refundPolicy'
>;

export const meta: Route.MetaFunction = ({
  data,
  location,
}: {
  data?: {policy?: {title?: string}};
  location: {pathname: string};
}) => {
  const policyTitle = data?.policy?.title ?? 'Policy';
  const title = `${policyTitle} — ${BRAND_NAME}`;
  // Legal pages have no merchant-supplied SEO description; we leave it
  // empty rather than invent generic copy that risks duplication across
  // policies. Phase 2 will surface a per-policy summary if Shopify
  // exposes one.
  const description = '';
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

export async function loader({params, context}: Route.LoaderArgs) {
  if (!params.handle) {
    throw new Response('No handle was passed in', {status: 404});
  }

  const policyName = params.handle.replace(
    /-([a-z])/g,
    (_: unknown, m1: string) => m1.toUpperCase(),
  ) as SelectedPolicies;

  const data = await context.storefront.query(POLICY_CONTENT_QUERY, {
    variables: {
      privacyPolicy: false,
      shippingPolicy: false,
      termsOfService: false,
      refundPolicy: false,
      [policyName]: true,
      language: context.storefront.i18n?.language,
    },
  });

  const policy = data.shop?.[policyName];

  if (!policy) {
    throw new Response('Could not find the policy', {status: 404});
  }

  return {policy};
}

export default function Policy() {
  const {policy} = useLoaderData<typeof loader>();
  const params = useParams();
  const rawLocale = (params as {locale?: string}).locale;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  return (
    <div className="policy">
      <br />
      <br />
      <div>
        <Link to={localeHref(locale, '/policies')}>← Back to Policies</Link>
      </div>
      <br />
      <h1>{policy.title}</h1>
      <div dangerouslySetInnerHTML={{__html: policy.body}} />
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/Shop
const POLICY_CONTENT_QUERY = `#graphql
  fragment Policy on ShopPolicy {
    body
    handle
    id
    title
    url
  }
  query Policy(
    $country: CountryCode
    $language: LanguageCode
    $privacyPolicy: Boolean!
    $refundPolicy: Boolean!
    $shippingPolicy: Boolean!
    $termsOfService: Boolean!
  ) @inContext(language: $language, country: $country) {
    shop {
      privacyPolicy @include(if: $privacyPolicy) {
        ...Policy
      }
      shippingPolicy @include(if: $shippingPolicy) {
        ...Policy
      }
      termsOfService @include(if: $termsOfService) {
        ...Policy
      }
      refundPolicy @include(if: $refundPolicy) {
        ...Policy
      }
    }
  }
` as const;
