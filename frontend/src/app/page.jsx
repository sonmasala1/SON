import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Image from 'next/image';
import Link from 'next/link';
import Icon from '@/components/Icon';
import HomeCatalogue from '@/components/HomeCatalogue';
import ReviewsSlider from '@/components/ReviewsSlider';

export default function HomePage() {
  return <main id="main" className="shopping-home">
    <section className="hero shopping-hero">
      <div className="hero-copy"><p className="eyebrow"><span /><Text>{" THE HEART OF AN INDIAN KITCHEN"}</Text></p><LocalizedAttrs><h1 lang="hi"><Text>{"हर स्वाद में"}</Text><br /><Text>{"अपनापन"}</Text></h1></LocalizedAttrs><h2><Text>{"Pure Flavour."}</Text><br /><em><Text>{"Authentic Indian Spices."}</Text></em></h2><p className="hero-description"><Text>{"Everyday favourites. Familiar aromas."}</Text><br /><Text>{"A little warmth for every meal you share."}</Text></p><div className="hero-buttons"><Link className="button" href="/shop"><Text>{"Shop Now "}</Text><Icon size={24} /></Link><Link className="text-link" href="/shop?category=ground-spices"><Text>{"Explore Masalas "}</Text><Icon size={24} /></Link></div><div className="hero-note"><span className="note-line" /><span><Text>{"SON MASALA · सोन मसाला"}</Text></span></div></div>
      <div className="hero-visual"><LocalizedAttrs><Image src="/images/spices.jpg" alt="Turmeric, chillies, coriander, and whole Indian spices" fill priority sizes="(max-width: 639px) 100vw, 50vw" className="hero-photo" /></LocalizedAttrs><div className="photo-shade" /><div className="hero-stamp"><Icon name="sun" size={25} /><span><Text>{"A TASTE OF"}</Text><br /><Text>{"YOUR OWN KITCHEN"}</Text></span><LocalizedAttrs><small lang="hi"><Text>{"सोन मसाला"}</Text></small></LocalizedAttrs></div><div className="hero-caption"><span><Text>{"BIG FLAVOURS."}</Text><br /><Text>{"EVERYDAY MOMENTS."}</Text></span><span className="caption-arrow">↗</span></div><span className="image-index"><Text>{"YOUR NEXT FAVOURITE MEAL STARTS HERE"}</Text></span></div>
    </section>
    <HomeCatalogue />
    <ReviewsSlider />
  </main>;
}
