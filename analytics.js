"use strict";

(() => {
  const measurementId = "G-DH5NEHVY84";
  const preferenceKey = "vostok-analytics-consent";
  const disableKey = `ga-disable-${measurementId}`;
  const notice = document.getElementById("analytics-status");
  const accept = document.getElementById("analytics-accept");
  const decline = document.getElementById("analytics-decline");
  const pageLocation = new URL("./", window.location.href).href;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const privacySignal = navigator.globalPrivacyControl === true;
  const consentState = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  let choice;
  let loading = false;
  let ready = false;
  let openingSent = false;
  let installPending = false;
  let installSent = false;

  function tag() {
    window.dataLayer.push(arguments);
  }

  function allowed() {
    return !privacySignal && choice === "granted";
  }

  function updateControls() {
    accept.disabled = privacySignal || allowed();
    decline.disabled = choice === "denied";
    notice.textContent = privacySignal ? "Medição desativada pela preferência de privacidade do navegador."
      : allowed() ? "Medição de uso permitida." : "Medição de uso desativada.";
  }

  function sendEvents() {
    if (!allowed() || !ready || navigator.onLine === false) return;
    if (!openingSent) {
      openingSent = true;
      tag("js", new Date());
      tag("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: pageLocation,
        page_referrer: "",
      });
      tag("event", "page_view");
      if (standalone) tag("event", "vostok_standalone_open");
    }
    if (installPending && !installSent) {
      installSent = true;
      installPending = false;
      tag("event", "vostok_pwa_install_detected");
    }
  }

  function start() {
    if (!allowed() || navigator.onLine === false) return;
    if (ready) {
      sendEvents();
      return;
    }
    if (loading) return;
    loading = true;
    window.dataLayer = window.dataLayer || [];
    // The loader expects the standard gtag function on the window.
    window.gtag = tag;
    tag("consent", "default", { ...consentState, analytics_storage: "denied" });
    const script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.addEventListener("load", () => {
      loading = false;
      ready = true;
      if (allowed()) tag("consent", "update", { analytics_storage: "granted" });
      sendEvents();
    }, { once: true });
    script.addEventListener("error", () => {
      loading = false;
      script.remove();
    }, { once: true });
    document.head.append(script);
  }

  function choose(value) {
    choice = value;
    window[disableKey] = !allowed();
    try { localStorage.setItem(preferenceKey, value); } catch {
      // A escolha continua válida nesta abertura.
    }
    if (!allowed()) installPending = false;
    if (ready) tag("consent", "update", { analytics_storage: allowed() ? "granted" : "denied" });
    updateControls();
    start();
  }

  try { choice = localStorage.getItem(preferenceKey); } catch {
    // Sem uma escolha acessível, a medição fica desativada.
  }
  window[disableKey] = !allowed();
  updateControls();

  accept.addEventListener("click", () => choose("granted"));
  decline.addEventListener("click", () => choose("denied"));
  window.addEventListener("storage", (event) => {
    if (event.key !== preferenceKey && event.key !== null) return;
    choice = event.key === preferenceKey ? event.newValue : null;
    window[disableKey] = !allowed();
    if (!allowed()) installPending = false;
    if (ready) tag("consent", "update", { analytics_storage: allowed() ? "granted" : "denied" });
    updateControls();
    start();
  });
  window.addEventListener("online", start);
  window.addEventListener("appinstalled", () => {
    if (!allowed() || navigator.onLine === false || installSent) return;
    installPending = true;
    start();
  });

  start();
})();
