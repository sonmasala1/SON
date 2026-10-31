"use client";
import { Text, LocalizedAttrs } from "@/components/LocalizedText";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";
import LanguageToggle from "./LanguageToggle";

export function Brand({ light = false }) {
  return (
    <LocalizedAttrs>
      <Link
        className={`brand ${light ? "brand-light" : ""}`}
        href="/"
        aria-label="SON MASALA home"
      >
        <span className="brand-mark" aria-hidden="true">
          <Icon name="sun" size={37} />
        </span>
        <span>
          <strong>
            <Text>{"SON "}</Text>
            <span>
              <Text>{"MASALA"}</Text>
            </span>
          </strong>
          <LocalizedAttrs>
            <small lang="hi">
              <Text>{"सोन मसाला"}</Text>
            </small>
          </LocalizedAttrs>
        </span>
      </Link>
    </LocalizedAttrs>
  );
}

export default function Header() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const { cartCount, wishlist, setDrawerOpen, user } = useStore();
  const pathname = usePathname();
  if (/^\/(admin|owner)(\/|$)/.test(pathname)) {
    return /\/(login|accept-invitation)$/.test(pathname) ? <header className="staff-header"><div className="wrap staff-header-inner"><Brand /><span className="staff-header-label">Secure administration</span></div></header> : null;
  }
  if (pathname === "/login")
    return (
      <header className="customer-auth-header">
        <div className="customer-auth-header-inner">
          <Brand />
          <LocalizedAttrs>
            <nav
              className={`customer-auth-nav ${menu ? "is-open" : ""}`}
              aria-label="Main navigation"
            >
              <Text>
                {[
                  ["Home", "/"],
                  ["All Spices", "/shop"],
                  ["Our Story", "/about"],
                  ["Contact", "/contact"],
                ].map(([name, href]) => (
                  <Link key={href} href={href} onClick={() => setMenu(false)}>
                    <Text>{name}</Text>
                  </Link>
                ))}
              </Text>
            </nav>
          </LocalizedAttrs>
          <div className="customer-auth-header-actions">
            <Link className="customer-header-shop" href="/shop">
              <Text>Shop Now</Text>
            </Link>
            <LanguageToggle />
            <LocalizedAttrs>
              <button
                className="icon-button header-cart"
                onClick={() => setDrawerOpen(true)}
                aria-label={`Shopping cart, ${cartCount} items`}
                aria-haspopup="dialog"
              >
                <Icon name="cart" size={26} />
                {cartCount > 0 && <span className="badge">{cartCount}</span>}
              </button>
            </LocalizedAttrs>
            <LocalizedAttrs preserve={["title"]}>
              <Link
                className="icon-button account-link header-profile"
                href={user ? "/account" : "/login"}
                aria-label={user ? "Customer profile" : "Customer login"}
                title={user?.name}
              >
                <Icon name="profile" size={26} />
                {user && (
                  <span className="header-customer-name" translate="no">
                    {user.name.split(" ")[0]}
                  </span>
                )}
              </Link>
            </LocalizedAttrs>
            <LocalizedAttrs>
              <button
                className="customer-auth-menu-toggle"
                onClick={() => setMenu(!menu)}
                aria-label={menu ? "Close menu" : "Open menu"}
                aria-expanded={menu}
              >
                <Icon name={menu ? "close" : "menu"} />
              </button>
            </LocalizedAttrs>
          </div>
        </div>
      </header>
    );
  const links = [
    ["Home", "/"],
    ["Categories", "/shop#categories"],
    ["About", "/about"],
    ["Contact", "/contact"],
  ];
  return (
    <>
      <header className="site-header">
        <div className="header-inner wrap">
          <Brand />
          <LocalizedAttrs>
            <nav
              className={`main-nav ${menu ? "is-open" : ""}`}
              aria-label="Main navigation"
            >
              <Text>
                {links.map(([name, href]) => (
                  <Link
                    onClick={() => setMenu(false)}
                    className={pathname === href.split("#")[0] ? "active" : ""}
                    key={href}
                    href={href}
                  >
                    <Text>{name}</Text>
                  </Link>
                ))}
              </Text>
              <Link
                className="mobile-profile"
                href={user ? "/account" : "/login"}
                onClick={() => setMenu(false)}
              >
                <Text>
                  {user ? <span translate="no">{user.name}</span> : "Sign In"}
                </Text>
              </Link>
            </nav>
          </LocalizedAttrs>
          <div className="header-actions">
            <LocalizedAttrs>
              <button
                className="icon-button header-search-toggle"
                onClick={() => setSearch(!search)}
                aria-label="Search products"
                aria-expanded={search}
              >
                <Icon name="search" />
              </button>
            </LocalizedAttrs>
            {user && (
              <LocalizedAttrs>
                <Link
                  className="icon-button wishlist-link"
                  href="/wishlist"
                  aria-label={`Wishlist, ${wishlist.length} items`}
                >
                  <Icon name="heart" />
                  {wishlist.length > 0 && (
                    <span className="badge">{wishlist.length}</span>
                  )}
                </Link>
              </LocalizedAttrs>
            )}
            <LanguageToggle />
            <LocalizedAttrs>
              <button
                className="icon-button header-cart"
                onClick={() => setDrawerOpen(true)}
                aria-label={`Shopping cart, ${cartCount} items`}
                aria-haspopup="dialog"
              >
                <Icon name="cart" size={26} />
                {cartCount > 0 && <span className="badge">{cartCount}</span>}
              </button>
            </LocalizedAttrs>
            <LocalizedAttrs preserve={["title"]}>
              <Link
                className="icon-button account-link header-profile"
                href={
                  user
                    ? "/account"
                    : `/login${pathname === "/checkout" ? "?next=%2Fcheckout" : ""}`
                }
                aria-label={user ? "Customer profile" : "Customer login"}
                title={user?.name}
              >
                <Icon name="profile" size={26} />
                {user && (
                  <span className="header-customer-name" translate="no">
                    {user.name.split(" ")[0]}
                  </span>
                )}
              </Link>
            </LocalizedAttrs>
            <LocalizedAttrs>
              <button
                className="icon-button menu-toggle"
                onClick={() => setMenu(!menu)}
                aria-label={menu ? "Close menu" : "Open menu"}
                aria-expanded={menu}
              >
                <Icon name={menu ? "close" : "menu"} />
              </button>
            </LocalizedAttrs>
          </div>
        </div>
        <Text>
          {search && (
            <form className="header-search wrap" action="/shop">
              <label className="sr-only" htmlFor="header-search">
                <Text>{"Search spices"}</Text>
              </label>
              <Icon name="search" />
              <LocalizedAttrs>
                <input
                  autoFocus
                  id="header-search"
                  name="q"
                  type="search"
                  maxLength={80}
                  placeholder="Find a little flavour…"
                />
              </LocalizedAttrs>
              <button className="button button-small" type="submit">
                <Text>{"Search"}</Text>
              </button>
            </form>
          )}
        </Text>
      </header>
    </>
  );
}
