
/* =========================================================
   DEEP SEA - MENÚ MÓVIL
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    const sidebar = document.querySelector(".sidebar");

    if (!sidebar) return;

    /* Crear botón móvil */
    let menuButton = document.querySelector(".mobile-menu-btn");

    if (!menuButton) {

        menuButton = document.createElement("button");

        menuButton.className = "mobile-menu-btn";
        menuButton.type = "button";
        menuButton.setAttribute("aria-label", "Abrir menú");
        menuButton.setAttribute("aria-expanded", "false");

        menuButton.innerHTML = `
            <svg width="22" height="22"
                 viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-width="2">
                <path d="M4 6h16"></path>
                <path d="M4 12h16"></path>
                <path d="M4 18h16"></path>
            </svg>
        `;

        /*
         * Lo colocamos al comienzo del topbar.
         */
        const topbar = document.querySelector(".topbar");

        if (topbar) {
            topbar.insertBefore(menuButton, topbar.firstChild);
        } else {
            document.body.appendChild(menuButton);

            menuButton.style.position = "fixed";
            menuButton.style.top = "12px";
            menuButton.style.left = "12px";
        }
    }

    /* Crear overlay */
    let overlay = document.querySelector(".mobile-overlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "mobile-overlay";

        document.body.appendChild(overlay);
    }

    /* Abrir menú */
    function openMenu() {

        sidebar.classList.add("mobile-open");
        overlay.classList.add("show");

        menuButton.setAttribute("aria-expanded", "true");
        menuButton.setAttribute("aria-label", "Cerrar menú");

        menuButton.innerHTML = `
            <svg width="22" height="22"
                 viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-width="2">
                <path d="M6 6l12 12"></path>
                <path d="M18 6L6 18"></path>
            </svg>
        `;

        document.body.style.overflow = "hidden";
    }

    /* Cerrar menú */
    function closeMenu() {

        sidebar.classList.remove("mobile-open");
        overlay.classList.remove("show");

        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Abrir menú");

        menuButton.innerHTML = `
            <svg width="22" height="22"
                 viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-width="2">
                <path d="M4 6h16"></path>
                <path d="M4 12h16"></path>
                <path d="M4 18h16"></path>
            </svg>
        `;

        document.body.style.overflow = "";
    }

    /* Abrir / cerrar */
    menuButton.addEventListener("click", function () {

        if (sidebar.classList.contains("mobile-open")) {
            closeMenu();
        } else {
            openMenu();
        }

    });

    /* Cerrar tocando fuera */
    overlay.addEventListener("click", closeMenu);

    /* Cerrar al tocar un enlace */
    sidebar.querySelectorAll("a").forEach(function (link) {

        link.addEventListener("click", function () {

            if (window.innerWidth <= 800) {
                closeMenu();
            }

        });

    });

    /* Cerrar con ESC */
    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape") {
            closeMenu();
        }

    });

    /* Al volver a PC */
    window.addEventListener("resize", function () {

        if (window.innerWidth > 800) {
            closeMenu();
        }

    });

});

