/**
 * Root document — G-Berg Hydrogen storefront.
 *
 * Replaces the skeleton's PageLayout with our UtilityBar / Header / Footer
 * shell. Loads Inter + Fraunces from Google Fonts via <link>, imports the
 * Tailwind v4 stylesheet (which itself imports @gberg/theme-tokens), and
 * sets <html lang="en" data-brand="heating"> per the brand spec.
 */
import {Analytics, getShopAnalytics, useNonce} from '@shopify/hydrogen';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import type {Route} from './+types/root';
import favicon from '~/assets/favicon.svg';
import {FOOTER_QUERY, HEADER_QUERY} from '~/lib/fragments';
import tailwindCss from './styles/tailwind.css?url';
import {UtilityBar} from '~/components/gberg/utility-bar';
import {Header} from '~/components/gberg/header';
import {Footer} from '~/components/gberg/footer';
import {WhatsAppBubble} from '~/components/gberg/whatsapp-bubble';
import {Aside} from '~/components/Aside';
import {DEFAULT_LOCALE, normalizeLocale} from '~/lib/gberg/i18n';
import type {MenuItem} from '@gberg/shopify-client';

export type RootLoader = typeof loader;

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  if (formMethod && formMethod !== 'GET') return true;
  if (currentUrl.toString() === nextUrl.toString()) return true;
  return false;
};

export function links() {
  return [
    {rel: 'preconnect', href: 'https://cdn.shopify.com'},
    {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous'},
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap',
    },
    {rel: 'icon', type: 'image/svg+xml', href: favicon},
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  const {storefront, env} = args.context;

  return {
    ...deferredData,
    ...criticalData,
    publicStoreDomain: env.PUBLIC_STORE_DOMAIN,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      withPrivacyBanner: false,
      country: args.context.storefront.i18n.country,
      language: args.context.storefront.i18n.language,
    },
  };
}

async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront} = context;
  const [header] = await Promise.all([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {headerMenuHandle: 'main-menu'},
    }),
  ]);
  return {header};
}

function loadDeferredData({context}: Route.LoaderArgs) {
  const {storefront, customerAccount, cart} = context;

  const footer = storefront
    .query(FOOTER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {footerMenuHandle: 'footer'},
    })
    .catch((error: Error) => {
      console.error(error);
      return null;
    });
  return {
    cart: cart.get(),
    isLoggedIn: customerAccount.isLoggedIn(),
    footer,
  };
}

/**
 * Convert Hydrogen's HeaderQuery menu shape into our `MenuItem[]` shape so
 * the existing Header component can render it without changes.
 */
function adaptMenu(raw: unknown): MenuItem[] {
  // raw is { menu: { items: [{ title, url, items: [{title,url,items:[]}] }] } }
  const items = (raw as {menu?: {items?: unknown[]}})?.menu?.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const it = item as {
      title?: string;
      url?: string | null;
      items?: unknown[];
    };
    return {
      title: it.title ?? '',
      url: it.url ?? null,
      items: Array.isArray(it.items)
        ? it.items.map((c) => {
            const ci = c as {title?: string; url?: string | null};
            return {
              title: ci.title ?? '',
              url: ci.url ?? null,
              items: [],
            } as MenuItem;
          })
        : [],
    } as MenuItem;
  });
}

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();

  return (
    <html lang="en" data-brand="heating">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={tailwindCss}></link>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<RootLoader>('root');

  if (!data) {
    return <Outlet />;
  }

  // Locale comes from URL — for the simple EN-only setup we hardcode here.
  // ($locale) routes still receive the param via their own loader.
  const locale = DEFAULT_LOCALE;
  const headerMenu = adaptMenu(data.header);

  return (
    <Analytics.Provider
      cart={data.cart}
      shop={data.shop}
      consent={data.consent}
    >
      <Aside.Provider>
        <UtilityBar locale={locale} />
        <Header locale={locale} menu={headerMenu} />
        <main id="main">
          <Outlet />
        </main>
        <Footer locale={locale} />
        <WhatsAppBubble />
      </Aside.Provider>
    </Analytics.Provider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = 'Unknown error';
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message ?? error.data;
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div className="container-x py-16">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
        Error {errorStatus}
      </p>
      <h1 className="display-heading mt-3 text-[clamp(2rem,3vw+1rem,3.5rem)]">
        Something went wrong.
      </h1>
      {errorMessage ? (
        <pre className="mt-6 max-w-3xl whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
          {errorMessage}
        </pre>
      ) : null}
    </div>
  );
}

// Variable used to satisfy the suppressed lint that wants normalizeLocale used.
void normalizeLocale;
