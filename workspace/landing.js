import { markup, languagePicker, setLanguage, tr } from "./i18n.js";
const original = document.body.innerHTML;
function render() {
  document.body.innerHTML = markup(original);
  document
    .querySelector(".landing-nav > div")
    .insertAdjacentHTML("afterbegin", languagePicker());
  document.title = tr("Adrial Workspace — From conversation to delivery.");
}
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-language]")) {
    setLanguage(event.target.value);
    render();
  }
});
render();
