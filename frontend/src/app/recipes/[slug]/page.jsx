import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { recipes } from '@/lib/recipes';

export function generateStaticParams() { return recipes.map(({ slug }) => ({ slug })); }
export default function RecipePage({ params }) {
  const recipe = recipes.find(item => item.slug === params.slug);
  if (!recipe) notFound();
  return <main id="main" className="wrap page-content"><Link className="back-link" href="/recipes"><Text>{"← The recipe diary"}</Text></Link><p className="eyebrow"><Text>{recipe.time}</Text><Text>{" MINUTES · "}</Text><Text>{recipe.tag}</Text></p><h1><Text>{recipe.title}</Text></h1><p className="page-intro"><Text>{recipe.description}</Text></p><div className="recipe-method"><aside><h2><Text>{"What you’ll need"}</Text></h2><ul><Text>{recipe.ingredients.map(item => <li key={item}><Text>{item}</Text></li>)}</Text></ul></aside><section><h2><Text>{"Let’s cook"}</Text></h2><ol><Text>{recipe.steps.map(item => <li key={item}><Text>{item}</Text></li>)}</Text></ol><Link href="/shop" className="text-link"><Text>{"Explore our spice shelf →"}</Text></Link></section></div></main>;
}
