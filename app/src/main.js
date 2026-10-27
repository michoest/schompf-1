import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { registerSW } from 'virtual:pwa-register'
import { setRegistration } from './utils/update'

// Styles
import '@mdi/font/css/materialdesignicons.css'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)

app.mount('#app')

// Service Worker: neue Version sofort übernehmen (Seite lädt dann neu) und beim Zurückkehren
// in die App nach Updates schauen – sonst bleibt die installierte App auf alten Ständen hängen.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(url, registration) {
    if (!registration) return
    setRegistration(registration)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
    setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000)
  },
})
void updateSW
