import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import SavedProducts from '@/components/SavedProducts';
export default function WishlistPage() { return <main id="main" className="wrap page-content"><p className="eyebrow"><Text>{"SAVED FOR ANOTHER MEAL"}</Text></p><h1><Text>{"Your favourites."}</Text></h1><SavedProducts mode="wishlist" /></main>; }
