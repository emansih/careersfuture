import { expect, it } from "vitest";
import { htmlToText } from "./html.js";

it("converts paragraphs, lists and breaks to readable text", () => {
  const html = "<p>Intro<br>line two</p><ul><li>One</li><li>Two &amp; three</li></ul><p>Bye</p>";
  expect(htmlToText(html)).toBe("Intro\nline two\n\n- One\n- Two & three\n\nBye");
});

it("decodes named and numeric entities without double decoding", () => {
  expect(htmlToText("a&nbsp;b &#8211; &#x2019;s &lt;b&gt; &amp;amp; &bogus;")).toBe(
    "a b – ’s <b> &amp; &bogus;",
  );
});

it("drops script/style and comments and strips attributes", () => {
  expect(
    htmlToText('<style>p{}</style><!-- c --><div class="x">Hi <strong>there</strong></div><script>alert(1)</script>'),
  ).toBe("Hi there");
});

it("keeps a bare less-than sign", () => {
  expect(htmlToText("<p>salary < 5000 and 3 > 2</p>")).toBe("salary < 5000 and 3 > 2");
});
