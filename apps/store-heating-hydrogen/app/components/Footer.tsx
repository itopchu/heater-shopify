import {Suspense} from 'react';
import {Await, NavLink} from 'react-router';
import type {FooterQuery, HeaderQuery} from 'storefrontapi.generated';
import {useT, type TFunction} from '~/lib/gberg/i18n';

interface FooterProps {
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  publicStoreDomain: string;
}

export function Footer({
  footer: footerPromise,
  header,
  publicStoreDomain,
}: FooterProps) {
  return (
    <Suspense>
      <Await resolve={footerPromise}>
        {(footer) => (
          <footer className="footer">
            {footer?.menu && header.shop.primaryDomain?.url && (
              <FooterMenu
                menu={footer.menu}
                primaryDomainUrl={header.shop.primaryDomain.url}
                publicStoreDomain={publicStoreDomain}
              />
            )}
          </footer>
        )}
      </Await>
    </Suspense>
  );
}

function FooterMenu({
  menu,
  primaryDomainUrl,
  publicStoreDomain,
}: {
  menu: FooterQuery['menu'];
  primaryDomainUrl: FooterProps['header']['shop']['primaryDomain']['url'];
  publicStoreDomain: string;
}) {
  const t = useT();
  return (
    <nav className="footer-menu" role="navigation">
      {(menu || fallbackFooterMenu(t)).items.map((item) => {
        if (!item.url) return null;
        // if the url is internal, we strip the domain
        const url =
          item.url.includes('myshopify.com') ||
          item.url.includes(publicStoreDomain) ||
          item.url.includes(primaryDomainUrl)
            ? new URL(item.url).pathname
            : item.url;
        const isExternal = !url.startsWith('/');
        return isExternal ? (
          <a href={url} key={item.id} rel="noopener noreferrer" target="_blank">
            {item.title}
          </a>
        ) : (
          <NavLink
            end
            key={item.id}
            prefetch="intent"
            style={activeLinkStyle}
            to={url}
          >
            {item.title}
          </NavLink>
        );
      })}
    </nav>
  );
}

function fallbackFooterMenu(t: TFunction) {
  return {
    id: 'gid://shopify/Menu/199655620664',
    items: [
      {
        id: 'gid://shopify/MenuItem/461633060920',
        resourceId: 'gid://shopify/ShopPolicy/23358046264',
        tags: [],
        title: t('scaffold_nav.privacy_policy'),
        type: 'SHOP_POLICY',
        url: '/policies/privacy-policy',
        items: [],
      },
      {
        id: 'gid://shopify/MenuItem/461633093688',
        resourceId: 'gid://shopify/ShopPolicy/23358013496',
        tags: [],
        title: t('scaffold_nav.refund_policy'),
        type: 'SHOP_POLICY',
        url: '/policies/refund-policy',
        items: [],
      },
      {
        id: 'gid://shopify/MenuItem/461633126456',
        resourceId: 'gid://shopify/ShopPolicy/23358111800',
        tags: [],
        title: t('scaffold_nav.shipping_policy'),
        type: 'SHOP_POLICY',
        url: '/policies/shipping-policy',
        items: [],
      },
      {
        id: 'gid://shopify/MenuItem/461633159224',
        resourceId: 'gid://shopify/ShopPolicy/23358079032',
        tags: [],
        title: t('scaffold_nav.terms_of_service'),
        type: 'SHOP_POLICY',
        url: '/policies/terms-of-service',
        items: [],
      },
    ],
  };
}

function activeLinkStyle({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending: boolean;
}) {
  return {
    fontWeight: isActive ? 'bold' : undefined,
    color: isPending ? 'grey' : 'white',
  };
}
