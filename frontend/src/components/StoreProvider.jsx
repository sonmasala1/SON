"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  apiRequest,
} from "@/lib/api";
import CartDrawer from "./CartDrawer";

const Context = createContext(null);

export function StoreProvider({ children }) {
  const [cartData, setCartData] = useState(null);
  const [user, setUser] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistError, setWishlistError] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyItems, setBusyItems] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pathname = usePathname();

  const refreshPromise = useRef(null);
  const refreshVersion = useRef(0);
  const authEpoch = useRef(0);
  const cartMutationCount = useRef(0);
  const cartMutationQueue = useRef(Promise.resolve());
  const mutationVersion = useRef(0);
  const itemLocks = useRef(new Set());
  const wishlistInFlight = useRef(false);
  const wishlistEpoch = useRef(0);
  const customerIdentity = useRef(null);
  const previousPathname = useRef(pathname);
  const initialized = useRef(false);

  const noticeMessage =
    notice?.kind === "cart-added" ? "Added to Cart" : notice;

  const refreshCart = useCallback((options = {}) => {
    if (options.clearCustomer) {
      authEpoch.current += 1;
      wishlistEpoch.current += 1;
      customerIdentity.current = null;

      setUser(null);
      setCartData(null);
      setWishlist([]);
      setWishlistProducts([]);
      setWishlistError("");
    }

    if (refreshPromise.current && !options.clearCustomer) {
      return refreshPromise.current;
    }

    const epoch = authEpoch.current;
    const version = ++refreshVersion.current;
    const mutationAtStart = mutationVersion.current;

    const request = (async () => {
      try {
        let cartResult = null;
        let cartError = null;

        try {
          cartResult = await getCart();
        } catch (err) {
          cartError = err;
        }

        let customer = cartResult?.user ?? null;

        if (cartError) {
          try {
            const session = await apiRequest("auth/me");
            customer = session?.user ?? null;
          } catch {
            // Keep existing session state when both APIs fail.
            customer = null;
          }
        }

        if (epoch !== authEpoch.current) return null;

        if (!cartError) {
          const customerId = customer?.id ?? null;

          if (customerIdentity.current !== customerId) {
            wishlistEpoch.current += 1;
            customerIdentity.current = customerId;
            setWishlist([]);
            setWishlistProducts([]);
          }

          setUser(customer);

          if (
            version === refreshVersion.current &&
            mutationAtStart === mutationVersion.current
          ) {
            setCartData(cartResult.cart);
          }

          setError("");

          if (customerId) {
            const wishlistVersion = wishlistEpoch.current;

            try {
              const saved = await apiRequest("wishlist");

              if (
                epoch === authEpoch.current &&
                wishlistVersion === wishlistEpoch.current &&
                customerIdentity.current === customerId
              ) {
                setWishlist(saved.wishlist?.slugs ?? []);
                setWishlistProducts(saved.wishlist?.products ?? []);
                setWishlistError("");
              }
            } catch (err) {
              if (
                epoch === authEpoch.current &&
                wishlistVersion === wishlistEpoch.current
              ) {
                setWishlistError(err.message);
              }
            }
          } else {
            setWishlist([]);
            setWishlistProducts([]);
            setWishlistError("");
          }

          return cartResult.cart;
        }

        throw cartError;
      } catch (err) {
        if (epoch === authEpoch.current) {
          setError(err.message || "Unable to load cart");
        }

        return null;
      } finally {
        setLoading(false);
      }
    })();

    refreshPromise.current = request;

    void request.finally(() => {
      if (refreshPromise.current === request) {
        refreshPromise.current = null;
      }
    });

    return request;
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    setReady(true);
    void refreshCart();
  }, [refreshCart]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onFocus = () => {
      if (!refreshPromise.current && cartMutationCount.current === 0) {
        void refreshCart();
      }
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCart]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;

    if (cartMutationCount.current === 0) {
      void refreshCart();
    }
  }, [pathname, refreshCart]);

  // Serialise cart writes so older responses cannot replace newer writes.
  const mutate = useCallback(
    (action, itemKey = null) => {
      if (itemKey && itemLocks.current.has(itemKey)) {
        return Promise.resolve(false);
      }

      if (itemKey) {
        itemLocks.current.add(itemKey);
        setBusyItems((previous) => ({
          ...previous,
          [itemKey]: true,
        }));
      }

      cartMutationCount.current += 1;
      setBusy(true);
      setError("");

      const epoch = authEpoch.current;

      const operation = async () => {
        try {
          const result = await action();

          if (epoch !== authEpoch.current) return false;

          mutationVersion.current += 1;
          setCartData(result.cart);
          return true;
        } catch (err) {
          if (epoch === authEpoch.current) {
            setError(err.message || "Cart update failed");
            setNotice(err.message || "Cart update failed");
            await refreshCart();
          }

          return false;
        } finally {
          cartMutationCount.current -= 1;

          if (cartMutationCount.current === 0) {
            setBusy(false);
          }

          if (itemKey) {
            itemLocks.current.delete(itemKey);

            setBusyItems((previous) => {
              const next = { ...previous };
              delete next[itemKey];
              return next;
            });
          }
        }
      };

      const pending = cartMutationQueue.current.then(operation, operation);

      cartMutationQueue.current = pending.then(
        () => undefined,
        () => undefined,
      );

      return pending;
    },
    [refreshCart],
  );

  const addToCart = useCallback(
    async (product, variant, openDrawer = false) => {
      if (!product?._id || !variant?._id || variant.stock < 1) {
        return false;
      }

      const itemKey = `product:${product._id}:${variant._id}`;

      const success = await mutate(
        () => addCartItem(product._id, variant._id, 1),
        itemKey,
      );

      if (success) {
        setNotice({ kind: "cart-added" });

        // Keep the product listing page visible by default.
        if (openDrawer) setDrawerOpen(true);
      }

      return success;
    },
    [mutate],
  );

  const updateQuantity = useCallback(
    (id, quantity) => {
      if (!id || !Number.isInteger(quantity) || quantity < 1) {
        return Promise.resolve(false);
      }

      return mutate(() => updateCartItem(id, quantity), `cart:${id}`);
    },
    [mutate],
  );

  const removeItem = useCallback(
    (id) => {
      if (!id) return Promise.resolve(false);

      return mutate(() => removeCartItem(id), `cart:${id}`);
    },
    [mutate],
  );

  const toggleWishlist = useCallback(
    async (slug) => {
      if (!user || wishlistInFlight.current) return false;

      wishlistInFlight.current = true;
      wishlistEpoch.current += 1;

      setWishlistBusy(true);
      setWishlistError("");

      const epoch = authEpoch.current;
      const customerId = user.id;

      try {
        const result = await apiRequest(
          `wishlist/${encodeURIComponent(slug)}`,
          {
            method: wishlist.includes(slug) ? "DELETE" : "PUT",
            body: "{}",
          },
        );

        if (
          epoch !== authEpoch.current ||
          customerIdentity.current !== customerId
        ) {
          return false;
        }

        setWishlist(result.wishlist?.slugs ?? []);
        setWishlistProducts(result.wishlist?.products ?? []);

        return true;
      } catch (err) {
        if (epoch === authEpoch.current) {
          setWishlistError(err.message);
          setNotice(err.message);

          if (err.status === 401) {
            await refreshCart({ clearCustomer: true });
          }
        }

        return false;
      } finally {
        wishlistEpoch.current += 1;
        wishlistInFlight.current = false;
        setWishlistBusy(false);
      }
    },
    [user, wishlist, refreshCart],
  );

  return (
    <Context.Provider
      value={{
        cartData,
        cart: cartData?.items ?? [],
        cartCount: cartData?.count ?? 0,
        user,
        wishlist,
        wishlistProducts,
        wishlistBusy,
        wishlistError,
        ready,
        loading,
        busy,
        busyItems,
        error,
        notice: noticeMessage,
        drawerOpen,
        setDrawerOpen,
        refreshCart,
        addToCart,
        toggleWishlist,
        updateQuantity,
        removeItem,
      }}
    >
      {children}

      <CartDrawer />

      {noticeMessage && (
        <div className="toast" role="status" aria-live="polite">
          {noticeMessage}
        </div>
      )}
    </Context.Provider>
  );
}

export const useStore = () => useContext(Context);
