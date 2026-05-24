<script setup>
import { ref } from 'vue';
import { auth } from '../stores/auth.js';
import { useRouter } from 'vue-router';
const email = ref(''); const password = ref(''); const err = ref(''); const busy = ref(false);
const router = useRouter();
async function submit(){
  err.value=''; busy.value=true;
  try { await auth.login(email.value, password.value); router.push('/planner'); }
  catch(e){ err.value = e.message==='invalid_credentials' ? 'Wrong email or password.' : 'Could not sign in.'; }
  finally { busy.value=false; }
}
</script>
<template>
  <div style="max-width:380px;margin:14vh auto;text-align:center">
    <div class="serif" style="font-size:40px;font-weight:600">Serviam</div>
    <p class="muted serif" style="font-style:italic;margin-top:-4px">I will serve.</p>
    <input class="field" style="margin:14px 0 10px" v-model="email" type="email" placeholder="Email" @keyup.enter="submit">
    <input class="field" v-model="password" type="password" placeholder="Password" @keyup.enter="submit">
    <button class="btn" style="width:100%;margin-top:14px" :disabled="busy" @click="submit">{{ busy?'…':'Enter' }}</button>
    <p v-if="err" style="color:var(--ox);margin-top:10px">{{ err }}</p>
  </div>
</template>
