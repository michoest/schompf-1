<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore, useAppStore } from '@/stores'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const appStore = useAppStore()

const code = ref('')
const deviceName = ref(guessDeviceName())
const busy = ref(false)

function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  return 'Browser'
}

async function submit() {
  if (!code.value.trim()) return
  busy.value = true
  try {
    await session.pair(code.value.trim(), deviceName.value.trim())
    appStore.showSnackbar(`Hallo ${session.person.name}!`)
    router.replace(route.query.next || '/kochen')
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <v-card class="pa-6" max-width="380" width="100%">
      <div class="text-center mb-6">
        <v-icon icon="mdi-chef-hat" size="56" color="primary" />
        <h1 class="text-h5 mt-2">Schompf</h1>
        <p class="text-body-2 text-medium-emphasis mt-2">
          Gib den Anmeldecode ein, den du bekommen hast. Danach bleibt dieses Gerät angemeldet.
        </p>
      </div>
      <v-form @submit.prevent="submit">
        <v-text-field
          v-model="code" label="Anmeldecode" autofocus autocapitalize="characters" autocomplete="one-time-code"
          maxlength="6" class="code-field" :disabled="busy"
        />
        <v-text-field v-model="deviceName" label="Name dieses Geräts" :disabled="busy" />
        <v-btn type="submit" color="primary" block size="large" :loading="busy" :disabled="code.trim().length < 6">Anmelden</v-btn>
      </v-form>
    </v-card>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.code-field :deep(input) { letter-spacing: 0.3em; text-transform: uppercase; font-size: 1.3rem; }
</style>
