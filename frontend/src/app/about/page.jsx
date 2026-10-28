import { Text, LocalizedAttrs } from "@/components/LocalizedText";
import Image from "next/image";
export default function AboutPage() {
  return (
    <main id="main" className="about-page">
      <section className="story-section">
        <div className="story-image">
          <LocalizedAttrs>
            <Image
              src="/images/spices.jpg"
              alt="Everyday ingredients in an Indian kitchen"
              fill
              sizes="(max-width: 639px) 100vw, 50vw"
            />
          </LocalizedAttrs>
        </div>
        <div className="story-copy">
          <p className="eyebrow">
            <Text>{"ABOUT SON MASALA"}</Text>
          </p>
          <h1>
            <Text>{"A little spice."}</Text>
            <br />
            <Text>{"A taste of home."}</Text>
          </h1>
          <p>
            <Text>
              {
                "The comforting aroma of a familiar kitchen. A recipe passed across the table. That extra spoonful, served with love."
              }
            </Text>
          </p>
          <p>
            <Text>
              {
                "SON MASALA celebrates everyday Indian cooking and the moments we share around the table."
              }
            </Text>
          </p>
          <LocalizedAttrs>
            <span lang="hi" className="story-signature">
              <Text>{"हर स्वाद में अपनापन"}</Text>
            </span>
          </LocalizedAttrs>
        </div>
      </section>
    </main>
  );
}
