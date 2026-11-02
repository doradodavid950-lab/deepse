/* ==========================================================
   Lógica del módulo: registro.html (bloque 2)
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  const form         = document.getElementById('registerForm');
  const nameField    = document.getElementById('nameField');
  const phoneField   = document.getElementById('phoneField');
  const emailField   = document.getElementById('emailField');
  const tipoField    = document.getElementById('tipoField');
  const negocioField = document.getElementById('negocioField');
  const passField    = document.getElementById('passField');
  const confirmField = document.getElementById('confirmField');
  const nameInput    = document.getElementById('name');
  const phoneInput   = document.getElementById('phone');
  const emailInput   = document.getElementById('email');
  const negocioInput = document.getElementById('negocio');
  const passInput    = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const togglePass   = document.getElementById('togglePass');
  const submitBtn    = document.getElementById('submitBtn');
  const submitLabel  = document.getElementById('submitLabel');
  const submitArrow  = document.getElementById('submitArrow');
  const btnBack      = document.getElementById('btnBack');
  const toast        = document.getElementById('toast');
  const steps        = Array.prototype.slice.call(document.querySelectorAll('.step'));
  const wizCount     = document.getElementById('wizCount');
  const wizBars      = document.querySelectorAll('#wizProgress i');
  const wizBack      = document.getElementById('wizBack');
  const dItems       = Array.prototype.slice.call(document.querySelectorAll('#dSteps .ds'));
  const dLines       = Array.prototype.slice.call(document.querySelectorAll('#dSteps .dline'));
  const strengthBars = document.querySelectorAll('#strength i');
  const strengthLbl  = document.getElementById('strengthLabel');
  const reqLen       = document.getElementById('reqLen');
  const reqMatch     = document.getElementById('reqMatch');

  const TIPOS = ['Restaurante','Hotel','Supermercado','Pescadería','Distribuidor','Otro'];
  const mq = window.matchMedia('(max-width: 1000px)');
  let current = 1;     // paso actual (computador y celular)
  let loading = false;

  function showToast(message, type){
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => { toast.className = 'toast'; }, 4000);
  }

  function isValidEmail(value){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  // El nombre solo admite letras (con tildes y ñ), espacios, apóstrofes, puntos y guiones.
  function isValidName(value){
    return /^\p{L}[\p{L}\s'.-]+$/u.test(value);
  }

  // Nombre del negocio: letras, números y signos comunes (& . , # ' -)
  function isValidBusiness(value){
    return /^[\p{L}\p{N}][\p{L}\p{N}\s'&.,#-]{1,79}$/u.test(value);
  }

  // Teléfono opcional: 7 a 15 dígitos, puede llevar +, espacios, paréntesis y guiones
  function isValidPhone(value){
    if (!/^\+?[\d\s()-]+$/.test(value)) return false;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  function setInvalid(field, message){
    field.classList.add('invalid');
    if (message) field.querySelector('.field-error').textContent = message;
  }

  function selectedTipo(){
    const r = form.querySelector('input[name="tipo"]:checked');
    return r ? r.value : '';
  }

  /* ---------- Pasos (computador y celular) ---------- */
  function render(){
    steps.forEach(function(s){
      s.hidden = Number(s.dataset.step) !== current;
    });
    // Celular
    wizCount.textContent = 'Paso ' + current + ' de 3';
    wizBars.forEach(function(b, i){ b.classList.toggle('on', i < current); });
    // Computador
    dItems.forEach(function(it, i){
      const n = i + 1;
      it.classList.toggle('on', n === current);
      it.classList.toggle('done', n < current);
      it.querySelector('.dn').textContent = n < current ? '✓' : String(n);
    });
    dLines.forEach(function(l, i){ l.classList.toggle('done', i + 1 < current); });
    btnBack.hidden = current === 1;

    const siguiente = current < 3;
    submitLabel.textContent = loading ? 'Creando cuenta...' : (siguiente ? 'Siguiente' : 'Crear cuenta');
    submitArrow.classList.toggle('show', siguiente && !loading);
  }

  function goTo(step, focus){
    current = step;
    render();
    if (focus){
      const first = steps[current - 1].querySelector('input:not([type="radio"])');
      if (first) first.focus({ preventScroll: true });
      if (mq.matches) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  mq.addEventListener ? mq.addEventListener('change', render) : mq.addListener(render);

  wizBack.addEventListener('click', function(){
    if (current > 1) goTo(current - 1, false);
    else window.location.href = 'login.html';
  });

  btnBack.addEventListener('click', function(){
    if (!loading && current > 1) goTo(current - 1, true);
  });

  // En computador se puede volver a un paso ya completado haciendo clic en el indicador
  dItems.forEach(function(it, i){
    it.addEventListener('click', function(){
      if (!loading && (i + 1) < current) goTo(i + 1, true);
    });
  });

  /* ---------- Contraseña ---------- */
  togglePass.addEventListener('click', function(){
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    confirmInput.type = isPassword ? 'text' : 'password';
    togglePass.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  function tienePalabraOsecuenciaDebil(p){
    const v = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const comunes = ['password','contrasena','admin','usuario','deepsea','deepseaintelligence','marino','pescado','hola','welcome','letmein','qwerty','iloveyou','abc123','123456','000000'];
    if (comunes.some(w => v.includes(w))) return true;
    if (/(.)\1{3,}/i.test(p)) return true;
    if (/(?:0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|abcd|bcde|cdef|qwer|asdf)/i.test(p)) return true;
    return false;
  }
  function reglaContrasena(p){
    if (p.length < 8) return 'La contraseña debe tener mínimo 8 caracteres.';
    if (p !== p.trim()) return 'La contraseña no puede empezar ni terminar con espacios.';
    if (p.length > 72) return 'La contraseña no puede superar los 72 caracteres.';
    if (!/[A-Z]/.test(p)) return 'Incluye al menos una letra mayúscula.';
    if (!/\d/.test(p)) return 'Incluye al menos un número.';
    if (!/[^A-Za-z0-9]/.test(p)) return 'Incluye al menos un carácter especial, como !, @ o #.';
    if (tienePalabraOsecuenciaDebil(p)) return 'Evita palabras comunes, repeticiones o secuencias simples.';
    return '';
  }
  function strengthScore(p){
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) && !tienePalabraOsecuenciaDebil(p)) s++;
    return s;
  }
  function updateStrength(){
    const p = passInput.value;
    const sc = strengthScore(p);
    const colors = ['#E53935','#F5A524','#17A673','#17A673'];
    const labels = ['', 'Débil', 'Media', 'Segura', 'Muy segura'];
    strengthBars.forEach(function(b, i){
      b.style.background = i < sc ? colors[sc - 1] : '';
    });
    strengthLbl.textContent = p ? labels[sc] : '';
    strengthLbl.style.color = p ? colors[sc - 1] : '';
    document.getElementById('reqLen').classList.toggle('ok', p.length >= 8);
    document.getElementById('reqUpper').classList.toggle('ok', /[A-Z]/.test(p));
    document.getElementById('reqNumber').classList.toggle('ok', /\d/.test(p));
    document.getElementById('reqSymbol').classList.toggle('ok', /[^A-Za-z0-9]/.test(p));
    document.getElementById('reqNoWords').classList.toggle('ok', p.length > 0 && !tienePalabraOsecuenciaDebil(p));
    document.getElementById('reqMatch').classList.toggle('ok', p.length > 0 && p === confirmInput.value);
  }
  passInput.addEventListener('input', updateStrength);
  confirmInput.addEventListener('input', updateStrength);

  // Al escribir se quita el aviso rojo del campo
  [[nameField, nameInput],[phoneField, phoneInput],[emailField, emailInput],
   [negocioField, negocioInput],[passField, passInput],[confirmField, confirmInput]
  ].forEach(function(par){
    par[1].addEventListener('input', function(){ par[0].classList.remove('invalid'); });
  });
  form.querySelectorAll('input[name="tipo"]').forEach(function(r){
    r.addEventListener('change', function(){ tipoField.classList.remove('invalid'); });
  });

  /* ---------- Validación por paso ---------- */
  function validateStep(n){
    let ok = true;
    if (n === 1){
      const fullName = nameInput.value.trim().replace(/\s+/g, ' ');
      const email = emailInput.value.trim().toLowerCase();
      const phone = phoneInput.value.trim();
      if (!isValidName(fullName)) { setInvalid(nameField, 'Ingresa tu nombre completo (solo letras y espacios).'); ok = false; }
      if (!isValidEmail(email))   { setInvalid(emailField, 'Ingresa un correo electrónico válido.'); ok = false; }
      if (phone && !isValidPhone(phone)) { setInvalid(phoneField, 'Ingresa un teléfono válido (7 a 15 números).'); ok = false; }
    }
    if (n === 2){
      if (TIPOS.indexOf(selectedTipo()) === -1) { setInvalid(tipoField, 'Elige el tipo de establecimiento.'); ok = false; }
      const negocio = negocioInput.value.trim().replace(/\s+/g, ' ');
      if (!isValidBusiness(negocio)) { setInvalid(negocioField, 'Ingresa el nombre de tu establecimiento.'); ok = false; }
    }
    if (n === 3){
      const pass = passInput.value;
      const errorPass = reglaContrasena(pass);
      if (errorPass) { setInvalid(passField, errorPass); ok = false; }
      if (confirmInput.value.length === 0 || confirmInput.value !== pass) { setInvalid(confirmField, 'Las contraseñas no coinciden.'); ok = false; }
    }
    return ok;
  }

  function startLoading(){ loading = true; submitBtn.disabled = true; btnBack.disabled = true; render(); }
  function stopLoading(){ loading = false; submitBtn.disabled = false; btnBack.disabled = false; render(); }

  // Traduce los errores de Supabase (vienen en inglés) a mensajes claros.
  function traducirError(error){
    const msg = (error.message || '').toLowerCase();
    if (error.code === 'user_already_exists' || msg.includes('already registered')) {
      setInvalid(emailField, 'Este correo ya está registrado.');
      return 'Ese correo ya tiene una cuenta. Inicia sesión.';
    }
    if (error.status === 429 || msg.includes('rate limit')) {
      return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
    }
    if (msg.includes('password')) {
      return 'La contraseña no cumple los requisitos. Prueba con otra.';
    }
    if (msg.includes('email')) {
      return 'El correo electrónico no es válido.';
    }
    console.warn('Error de registro:', error);
    return 'No se pudo crear la cuenta. Intenta de nuevo.';
  }

  /* ---------- Envío ---------- */
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if (loading) return;

    // Los pasos 1 y 2 solo avanzan
    if (current < 3){
      if (validateStep(current)) { goTo(current + 1, true); }
      else { showToast('Revisa los campos marcados en rojo.', 'error'); }
      return;
    }

    // Se validan todos los pasos (así se marcan todos los errores)
    const resultados = [1, 2, 3].map(validateStep);
    const primerError = resultados.indexOf(false);
    if (primerError !== -1){
      goTo(primerError + 1, false);
      showToast('Revisa los campos marcados en rojo.', 'error');
      return;
    }

    const fullName = nameInput.value.trim().replace(/\s+/g, ' ');
    const email    = emailInput.value.trim().toLowerCase();
    const phone    = phoneInput.value.trim();
    const tipo     = selectedTipo();
    const negocio  = negocioInput.value.trim().replace(/\s+/g, ' ');
    const pass     = passInput.value;

    startLoading();

    // Los datos del perfil viajan como metadatos; un trigger en Supabase los guarda en "perfiles".
    // El rol NO se envía desde aquí: lo asigna la base de datos.
    let result;
    try {
      result = await supabaseClient.auth.signUp({
        email: email,
        password: pass,
        options: { data: {
          full_name: fullName,
          telefono: phone,
          tipo_establecimiento: tipo,
          nombre_establecimiento: negocio
        } }
      });
    } catch (err) {
      stopLoading();
      showToast('No se pudo conectar. Revisa tu internet e intenta de nuevo.', 'error');
      return;
    }

    const { data, error } = result;

    if (error) {
      stopLoading();
      const mensaje = traducirError(error);
      if (emailField.classList.contains('invalid')) goTo(1, false);
      showToast(mensaje, 'error');
      return;
    }

    // Si el correo ya existe y Supabase tiene "Confirm email" activado, NO devuelve
    // error: responde "éxito" pero sin identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      stopLoading();
      setInvalid(emailField, 'Este correo ya está registrado.');
      goTo(1, false);
      showToast('Ese correo ya tiene una cuenta. Inicia sesión.', 'error');
      return;
    }

    // Si Supabase abrió sesión automáticamente, la cerramos para que el usuario
    // pase por el inicio de sesión y no entre directo al sistema.
    const sessionAbierta = !!data.session;
    if (sessionAbierta) {
      try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (err) { /* no bloquea */ }
    }

    // El botón queda bloqueado mientras se redirige (evita crear la cuenta dos veces)
    loading = true;
    submitBtn.disabled = true;
    btnBack.disabled = true;
    submitLabel.textContent = 'Redirigiendo...';
    submitArrow.classList.remove('show');
    showToast(
      sessionAbierta
        ? 'Cuenta creada correctamente. Ahora inicia sesión.'
        : 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.',
      'success'
    );
    setTimeout(() => { window.location.href = 'login.html'; }, 2000);
  });

  render();
})();
