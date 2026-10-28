'use client';
import { Text } from '@/components/LocalizedText';
import { useLocale } from './LocaleProvider';
import { productName } from '@/lib/i18n';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getCart, addCartItem, updateCartItem, removeCartItem, apiRequest } from '@/lib/api';
import CartDrawer from './CartDrawer';
import { usePathname } from 'next/navigation';

const Context = createContext(null);
export function StoreProvider({ children }) {
  const { locale } = useLocale();
  const [cartData, setCartData] = useState(null);
  const [user, setUser] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistError, setWishlistError] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const initialized = useRef(false);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const inFlight = useRef(false);
  const authEpoch = useRef(0);
  const wishlistInFlight = useRef(false);
  const wishlistEpoch = useRef(0), customerIdentity = useRef(null);
  // Keep product data until render so an in-flight addition and its toast follow the current language.
  const noticeMessage = notice?.kind === 'cart-added' ? `${productName(notice.product, locale)} added to your bag` : notice;
  const refreshCart = useCallback(async (options = {}) => {
    if (options.clearCustomer) { authEpoch.current += 1; wishlistEpoch.current += 1; customerIdentity.current = null; setUser(null); setCartData(null); setWishlist([]); setWishlistProducts([]); setWishlistError(''); }
    const epoch = authEpoch.current;
    try {
      const [cartResult, sessionResult] = await Promise.allSettled([getCart(), apiRequest('auth/me')]);
      if (epoch !== authEpoch.current) return null;
      const customer = sessionResult.status === 'fulfilled' ? sessionResult.value.user : cartResult.status === 'fulfilled' ? cartResult.value.user : null;
      if (customerIdentity.current !== (customer?.id || null)) { wishlistEpoch.current += 1; customerIdentity.current = customer?.id || null; setWishlist([]); setWishlistProducts([]); }
      setUser(customer);
      if (customer) {
        const version = wishlistEpoch.current;
        try { const saved = await apiRequest('wishlist'); if (epoch === authEpoch.current && version === wishlistEpoch.current && customerIdentity.current === customer.id) { setWishlist(saved.wishlist.slugs); setWishlistProducts(saved.wishlist.products); setWishlistError(''); } }
        catch (error) { if (epoch === authEpoch.current && version === wishlistEpoch.current && customerIdentity.current === customer.id) setWishlistError(error.message); }
      } else { setWishlist([]); setWishlistProducts([]); setWishlistError(''); }
      if (epoch !== authEpoch.current) return null;
      if (cartResult.status === 'rejected') throw cartResult.reason;
      const result = cartResult.value; setCartData(result.cart); setError(''); return result.cart;
    }
    catch (error) { if (epoch === authEpoch.current) setError(error.message); return null; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // Legacy browser-only favourites have no verified owner. Leave that data untouched; all new favourites use the account API.
    setReady(true);
    void refreshCart();
  }, [refreshCart]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { const onFocus = () => { if (!inFlight.current) void refreshCart(); }; window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, [refreshCart]);
  useEffect(() => { if (previousPathname.current !== pathname) { previousPathname.current = pathname; void refreshCart(); } }, [pathname, refreshCart]);
  async function mutate(action) {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(''); const epoch = authEpoch.current;
    try { const result = await action(); if (epoch !== authEpoch.current) return false; setCartData(result.cart); return true; }
    catch (error) { await refreshCart(); setError(error.message); setNotice(error.message); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function addToCart(product, variant, openDrawer = true) {
    if (!variant || variant.stock < 1) return false;
    const success = await mutate(() => addCartItem(product._id, variant._id));
    if (success) { setNotice({ kind: 'cart-added', product: { name: product.name, hindiName: product.hindiName } }); if (openDrawer) setDrawerOpen(true); }
    return success;
  }
  async function toggleWishlist(slug) {
    if (!user || wishlistInFlight.current) return false;
    wishlistInFlight.current = true; wishlistEpoch.current += 1; setWishlistBusy(true); setWishlistError(''); const epoch = authEpoch.current, customerId = user.id;
    try {
      const result = await apiRequest(`wishlist/${encodeURIComponent(slug)}`, { method: wishlist.includes(slug) ? 'DELETE' : 'PUT', body: '{}' });
      if (epoch !== authEpoch.current || customerIdentity.current !== customerId) return false;
      setWishlist(result.wishlist.slugs); setWishlistProducts(result.wishlist.products); return true;
    } catch (error) { if (epoch === authEpoch.current) { setWishlistError(error.message); setNotice(error.message); if (error.status === 401) await refreshCart({ clearCustomer: true }); } return false; }
    finally { wishlistEpoch.current += 1; wishlistInFlight.current = false; setWishlistBusy(false); }
  }
  return <Context.Provider value={{ cartData, cart: cartData?.items || [], cartCount: cartData?.count || 0, user, wishlist, wishlistProducts, wishlistBusy, wishlistError, ready, loading, busy, error, notice: noticeMessage, drawerOpen, setDrawerOpen, refreshCart, addToCart, toggleWishlist, updateQuantity: (id, quantity) => mutate(() => updateCartItem(id, quantity)), removeItem: id => mutate(() => removeCartItem(id)) }}>{children}<CartDrawer /><Text>{noticeMessage && <div className="toast" role="status"><Text error>{noticeMessage}</Text></div>}</Text></Context.Provider>;
}
export const useStore = () => useContext(Context);
