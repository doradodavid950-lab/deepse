/* ==========================================================
   Lógica del módulo: login.html (bloque 2)
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(async function(){
  const form        = document.getElementById('loginForm');
  const emailField  = document.getElementById('emailField');
  const passField   = document.getElementById('passField');
  const emailInput  = document.getElementById('email');
  const passInput   = document.getElementById('password');
  const togglePass  = document.getElementById('togglePass');
  const submitBtn   = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const forgotLink  = document.getElementById('forgotLink');
  const toast       = document.getElementById('toast');

  // Si ya hay una sesión activa de Supabase, saltar directo al dashboard.
  // try/catch: si no hay internet o Supabase falla, el login sigue funcionando.
  try {
    const { data: { session: existingSession } } = await supabaseClient.auth.getSession();
    if (existingSession) {
      window.location.href = 'inicio.html';
      return;
    }
  } catch (err) {
    console.warn('No se pudo comprobar la sesión existente:', err);
  }

  function showToast(message, type){
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => { toast.className = 'toast'; }, 3200);
  }

  function isValidEmail(value){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  togglePass.addEventListener('click', function(){
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    togglePass.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  function clearError(field){ field.classList.remove('invalid'); }
  emailInput.addEventListener('input', () => clearError(emailField));
  passInput.addEventListener('input', () => clearError(passField));

  function startLoading(){
    submitBtn.disabled = true;
    submitLabel.textContent = 'Verificando...';
  }
  function stopLoading(){
    submitBtn.disabled = false;
    submitLabel.textContent = 'Iniciar sesión';
  }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    let valid = true;

    if (!isValidEmail(emailInput.value.trim())) {
      emailField.classList.add('invalid');
      valid = false;
    }
    if (passInput.value.length < 8) {
      passField.classList.add('invalid');
      valid = false;
    }

    if (!valid) {
      showToast('Revisa los campos marcados en rojo.', 'error');
      return;
    }

    startLoading();

    // try/catch: si la petición falla por red, el botón no se queda en "Verificando..."
    let error;
    try {
      const result = await supabaseClient.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passInput.value
      });
      error = result.error;
    } catch (err) {
      stopLoading();
      showToast('No se pudo conectar. Revisa tu internet e intenta de nuevo.', 'error');
      return;
    }

    stopLoading();

    if (error) {
      showToast('Correo o contraseña incorrectos.', 'error');
      return;
    }

    showToast('Inicio de sesión exitoso. Redirigiendo...', 'success');
    setTimeout(() => { window.location.href = 'inicio.html'; }, 700);
  });

  forgotLink.addEventListener('click', async function(e){
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) {
      showToast('Escribe tu correo arriba antes de recuperar la contraseña.', 'error');
      return;
    }
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
      if (error) {
        showToast('No se pudo enviar el correo de recuperación.', 'error');
      } else {
        showToast('Te enviamos un enlace de recuperación a tu correo.', 'success');
      }
    } catch (err) {
      showToast('No se pudo conectar. Revisa tu internet e intenta de nuevo.', 'error');
    }
  });
})();
