// Help centre (/help): questions and answers by topic. scripts/build.js turns this into the page
// (scripts/lib/trust-pages.js). A new question is one entry here; a new topic is one more group. Answers describe what
// the site really does (docs/production.md). Fields: id (the topic's and question's #anchor, permanent once linked),
// title, items: [{ id, q, a }]. An answer is a list of paragraphs and lists ({ list: [...] }); text may use
// [label](/path), **bold** and {contact} (the support address from data/site.js), nothing else.
window.HELP = [
  {
    id: "purchases",
    title: "Purchases and downloads",
    items: [
      { id: "how-downloads-work", q: "How do downloads work?", a: [
        "Everything you buy appears in [Your Stacc](/library). Choose a file and AutoStacc makes a private download link for it on the spot. The link only works for you and expires after a few minutes, so if a download is interrupted just press the button again for a new one."
      ] },
      { id: "missing-download", q: "I paid but don't see my files", a: [
        "Bank payments are sometimes confirmed a little after you return from checkout. The confirmation page checks again on its own; you can also open [Settings › Orders](/settings/orders) and choose \"Check it\" beside the order.",
        "If you bought as a guest, open Your Stacc from the link in your receipt email, on the same device if you can. Still nothing after an hour? {contact}"
      ] },
      { id: "download-again", q: "Can I download something again?", a: [
        "Yes, as often as you like, from [Your Stacc](/library) while you're signed in. Each press makes a fresh link."
      ] },
      { id: "guest-purchases", q: "I bought without an account", a: [
        "Your receipt email has a link that opens what you Stacc'd for 30 days. To keep them for good, [create an account](/login#signup) with the same email: once you confirm it, every guest purchase made with that email moves into your account."
      ] },
      { id: "duplicate", q: "Did I pay twice?", a: [
        "The store won't sell you something you already own, and pressing Checkout twice opens a single order. If you still see two charges for the same thing, see the [refund policy](/refunds#duplicate)."
      ] }
    ]
  },
  {
    id: "accounts",
    title: "Accounts",
    items: [
      { id: "create", q: "How do I create an account?", a: [
        "Go to [Create account](/login#signup), choose a password of at least 10 characters, then open the confirmation email and press its link. You can sign in once your email is confirmed."
      ] },
      { id: "verification", q: "The confirmation email didn't arrive or the link expired", a: [
        "Check your spam folder first. Confirmation links last 24 hours. If yours has expired or never came, use [Forgot password](/login#forgot) with the same email: resetting your password confirms the email too."
      ] },
      { id: "reset", q: "I forgot my password", a: [
        "Use [Forgot password](/login#forgot). The reset link works once, for an hour, and signs out your other devices."
      ] },
      { id: "change", q: "How do I change my name, password or email?", a: [
        "Your name: [Settings › Profile](/settings/profile). Your password and signed-in devices: [Settings › Security](/settings/security).",
        "Change your email in [Settings › Profile](/settings/profile): enter the new address and your password, then click the link we send there within an hour. Your Stacc moves with your account, and your old address is told about the change. Past receipts keep the address they were sent to."
      ] },
      { id: "delete", q: "How do I delete my account?", a: [
        "In [Settings › Privacy and data](/settings/privacy). Download your data first if you want a copy. Deleting signs you out everywhere and erases your account; nothing you've Stacc'd downloads anymore, and your orders stay only as anonymous sales records. If you run a creator space in the Studio, AutoStacc has to close it or hand it over first: {contact}"
      ] }
    ]
  },
  {
    id: "products",
    title: "Products",
    items: [
      { id: "contents", q: "What's in a product?", a: [
        "Each product page lists what's inside, its type and its format. Products are made of Pacs: folders of one kind of content (samples, loops, presets, stems and so on) grouped into Stacclets, so Your Stacc can sort everything you've Stacc'd by project, Stacclet, Pac and kind."
      ] },
      { id: "formats", q: "Which file formats will I get?", a: [
        "It depends on the product; its page lists the formats where the creator has given them. Files arrive as normal downloads (usually ZIP archives) that open on any computer."
      ] },
      { id: "license", q: "What can I do with what I buy?", a: [
        "Each kind of product has a licence. In short: sounds and presets can go into your own music, including music you sell; you can't share or resell the files themselves. The details are on the [licence page](/license) and on every product page."
      ] }
    ]
  },
  {
    id: "payments",
    title: "Payments and refunds",
    items: [
      { id: "stripe", q: "How are payments handled?", a: [
        "Checkout happens on Stripe's secure page. Your card details go to Stripe, never to AutoStacc. Prices are in US dollars."
      ] },
      { id: "failed", q: "My payment failed", a: [
        "Nothing was charged and your cart is still there. Check the card details or try another card. A pending amount your bank shows for a failed payment disappears on its own."
      ] },
      { id: "checkout-problems", q: "Checkout won't start", a: [
        "The cart lists anything that stops checkout, such as an item that's no longer for sale or one you already own; remove it and try again. If the store says it's offline, it's being worked on: your cart is kept, so try again shortly."
      ] },
      { id: "refunds", q: "Can I get a refund?", a: [
        "If you haven't downloaded anything from an order yet, you can refund it yourself within 14 days in [Settings › Orders](/settings/orders). Otherwise see the [refund policy](/refunds): duplicate charges, broken files and purchases you didn't make are refunded."
      ] }
    ]
  },
  {
    id: "autostacc",
    title: "Projects and Your Stacc",
    items: [
      { id: "follow", q: "What does following a project do?", a: [
        "Following puts a project's new releases on your [dashboard](/dashboard). Turn on Auto-Stacc as well, and its free releases are added to Your Stacc automatically, now and whenever new ones come out. Want an email too? Switch on new-release emails in [Settings › Emails](/settings/email). Follow from [Projects](/projects)."
      ] },
      { id: "your-stacc", q: "What is Your Stacc?", a: [
        "Your library: everything you've Stacc'd, sorted by project, Stacclet, Pac and kind, with downloads. It's at [Your Stacc](/library)."
      ] },
      { id: "free", q: "How do free releases work?", a: [
        "Free products are claimed with an account and then live in Your Stacc like anything you bought. With Auto-Stacc on, a followed project's free releases arrive by themselves."
      ] },
      { id: "notifications", q: "Will I get emails about new releases?", a: [
        "Only if you ask: switch them on in [Settings › Emails](/settings/email). None are being sent yet. Receipts and account emails always come."
      ] }
    ]
  }
];
