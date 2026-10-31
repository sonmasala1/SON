"use client";
import { Text, LocalizedAttrs } from "@/components/LocalizedText";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./Header";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";

export default function Footer() {
  const pathname = usePathname();
  const { user } = useStore();
  if (pathname === "/login") return null;
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Brand light />
          <p>
            <Text>{"A celebration of Indian kitchens."}</Text>
            <br />
            <Text>{"For everyday meals and memories"}</Text>
            <br />
            <Text>{"made around the table."}</Text>
          </p>
          <LocalizedAttrs>
            <span lang="hi" className="footer-hindi">
              <Text>{"हर स्वाद में अपनापन"}</Text>
            </span>
          </LocalizedAttrs>
        </div>
        <div>
          <h3>
            <Text>{"Explore the kitchen"}</Text>
          </h3>
          <Link href="/shop">
            <Text>{"Shop all spices"}</Text>
          </Link>
          <Link href="/shop#categories">
            <Text>{"Our categories"}</Text>
          </Link>
          <Link href="/about">
            <Text>{"Our story"}</Text>
          </Link>
          <Link href="/recipes">
            <Text>{"Recipes & inspiration"}</Text>
          </Link>
        </div>
        <div>
          <h3>
            <Text>{"Here to help"}</Text>
          </h3>
          <Link href="/contact">
            <Text>{"Contact us"}</Text>
          </Link>
          {user && (
            <Link href="/wishlist">
              <Text>{"Your wishlist"}</Text>
            </Link>
          )}
          <Link href="/cart">
            <Text>{"Your shopping bag"}</Text>
          </Link>
          <Link href="/policies">
            <Text>{"Store & privacy information"}</Text>
          </Link>
          <Link href="/health">
            <Text>{"Service status"}</Text>
          </Link>
        </div>
        <div>
          <h3>
            <Text>{"Let’s stay in touch"}</Text>
          </h3>
          <p className="contact-line">
            <Icon name="mail" />
            <Text>{" sonmasala1@gmail.com"}</Text>
          </p>
          <p className="contact-line">
            <Icon name="phone" />
            <Text>{" +91 9026041718"}</Text>
          </p>
          <p className="contact-line">
            <Icon name="pin" />
            <Text>{" Katwariya, Post- Oinimishra, Robertsganj, Sonbhadra, Uttar Pradesh, 231216"}</Text>
          </p>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>
          © <Text>{new Date().getFullYear()}</Text>
          <Text>{" SON MASALA. All rights reserved."}</Text>
        </span>
        <span>
          <Text>{"Indian flavours. Shared with love."}</Text>
        </span>
        <span className="footer-dot">
          ●{" "}
          <span>
            <Text>{"Made for your kitchen"}</Text>
          </span>
        </span>
      </div>
    </footer>
  );
}
