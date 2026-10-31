import { Text, LocalizedAttrs } from "@/components/LocalizedText";
import Newsletter from "@/components/Newsletter";
import Icon from "@/components/Icon";
export const metadata = { title: "Contact | SON MASALA" };
export default function ContactPage() {
  return (
    <main id="main">
      <section className="wrap page-content">
        <p className="eyebrow">
          <Text>{"LET’S TALK FLAVOUR"}</Text>
        </p>
        <h1>
          <Text>{"There’s always room"}</Text>
          <br />
          <Text>{"for a conversation."}</Text>
        </h1>
        <p className="page-intro">
          <Text>
            {
              "Questions about our spices, wholesale, or distribution? Our contact channels will be announced here."
            }
          </Text>
        </p>
        <div className="contact-grid">
          <div>
            <Icon name="mail" size={28} />
            <h2>
              <Text>{"Write to us"}</Text>
            </h2>
            <p>
              <Text>{"sonmasala1@gmail.com"}</Text>
            </p>
          </div>
          <div>
            <Icon name="phone" size={28} />
            <h2>
              <Text>{"Give us a call"}</Text>
            </h2>
            <p>
              <Text>{"+91 9026041718"}</Text>
            </p>
          </div>
          <div>
            <Icon name="pin" size={28} />
            <h2>
              <Text>{"Find our kitchen"}</Text>
            </h2>
            <p>
              <Text>{"Katwariya, Post- Oinimishra, Robertsganj, Sonbhadra, Uttar Pradesh, 231216"}</Text>
            </p>
          </div>
        </div>
        <p className="notice-box">
          <Text>
            {
              "Contact us for help with your order, payment or shipment."
            }
          </Text>
        </p>
      </section>
      <Newsletter />
    </main>
  );
}
