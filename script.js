// ==========================================
// DSI | SIGAB - Aplicación Principal
// ==========================================
(function () {
    "use strict";

    const STRAPI_BASE = "http://192.168.1.32:1337";
    const STRAPI_URL  = STRAPI_BASE + "/api";
    const Carlitos    = "http://192.168.1.140/";

    // --- Estado ---
    let usuarioActual     = null;
    let alertaActivaID    = null;
    let pollingEnCurso    = false;
    let pollingIntervalID = null;
    let pollingRetrasos   = 0;
    let carrito           = [];

    // --- Cache DOM ---
    const screens = {
        login:     document.getElementById("screen-login"),
        dashboard: document.getElementById("screen-dashboard"),
        admin:     document.getElementById("screen-admin"),
    };
    const gridBotones        = document.querySelector(".buttons-grid");
    const loader             = document.getElementById("loader");
    const lblNombre          = document.getElementById("lbl-nombre");
    const lblArea            = document.getElementById("lbl-area");
    const txtModo            = document.getElementById("txt-modo");
    const inputUser          = document.getElementById("input-user");
    const inputPass          = document.getElementById("input-pass");
    const btnLogin           = document.getElementById("btn-login");
    const btnLogout          = document.getElementById("btn-logout");
    const btnIrAdmin         = document.getElementById("btn-ir-admin");
    const btnEmergency       = document.getElementById("btn-emergency");
    const modalAyuda         = document.getElementById("modal-ayuda");
    const txtProblema        = document.getElementById("txt-problema");
    const alertaBloqueante   = document.getElementById("alerta-bloqueante");
    const alertaQuien        = document.getElementById("alerta-quien");
    const alertaMensaje      = document.getElementById("alerta-mensaje");
    const checkboxTheme      = document.getElementById("checkbox-theme");
    const formLogin          = document.getElementById("form-login");
    const btnEnviarAlerta    = document.getElementById("btn-enviar-alerta");
    const btnCancelarAyuda   = document.getElementById("btn-cancelar-ayuda");
    const btnResolverAlerta  = document.getElementById("btn-resolver-alerta");
    const customModalOverlay = document.getElementById("custom-modal-overlay");
    const customModalTitle   = document.getElementById("custom-modal-title");
    const customModalMessage = document.getElementById("custom-modal-message");
    const btnCustomCancel    = document.getElementById("btn-custom-cancel");
    const btnCustomOk        = document.getElementById("btn-custom-ok");
    // Admin DOM
    const adminLblUsuario    = document.getElementById("admin-lbl-usuario");
    const btnAdminVolver     = document.getElementById("btn-admin-volver");
    const btnAdminReloadInv  = document.getElementById("btn-admin-reload-inv");
    const btnAdminReloadAct  = document.getElementById("btn-admin-reload-act");
    const btnAdminReloadCor  = document.getElementById("btn-admin-reload-cor");
    const adminInvContainer  = document.getElementById("admin-inv-container");
    const adminActContainer  = document.getElementById("admin-act-container");
    const adminCorContainer  = document.getElementById("admin-cor-container");

    // ==========================================
    // UTILIDADES
    // ==========================================

    function mostrarDialogo(titulo, mensaje, esConfirmacion) {
        return new Promise(function (resolve) {
            customModalTitle.textContent   = titulo;
            customModalMessage.textContent = mensaje;
            customModalOverlay.classList.remove("hidden");
            customModalOverlay.classList.add("active");

            if (esConfirmacion) {
                btnCustomCancel.classList.remove("hidden");
            } else {
                btnCustomCancel.classList.add("hidden");
            }

            btnCustomOk.onclick = function () {
                cerrarDialogoCustom();
                resolve(true);
            };
            btnCustomCancel.onclick = function () {
                cerrarDialogoCustom();
                resolve(false);
            };
        });
    }

    function cerrarDialogoCustom() {
        customModalOverlay.classList.remove("active");
        customModalOverlay.classList.add("hidden");
    }

    function getAttributes(item) {
        return item.attributes || item;
    }

    async function fetchJSON(url, options) {
        const res = await fetch(url, options);
        if (!res.ok) {
            throw new Error("Error HTTP " + res.status + ": " + res.statusText);
        }
        return res.json();
    }

    function cambiarPantalla(ocultar, mostrar) {
        ocultar.classList.remove("active");
        ocultar.classList.add("hidden");
        mostrar.classList.remove("hidden");
        mostrar.classList.add("active");
    }

    function mostrarErrorEnGrid(mensaje) {
        gridBotones.innerHTML = "";
        const p = document.createElement("p");
        p.className = "accent-text";
        p.textContent = mensaje;
        gridBotones.appendChild(p);
    }

    /** Formatea una fecha ISO a "DD/MM/YYYY HH:MM" */
    function formatearFecha(isoString) {
        if (!isoString) return "—";
        const d = new Date(isoString);
        var dia  = String(d.getDate()).padStart(2, "0");
        var mes  = String(d.getMonth() + 1).padStart(2, "0");
        var año  = d.getFullYear();
        var hora = String(d.getHours()).padStart(2, "0");
        var min  = String(d.getMinutes()).padStart(2, "0");
        return dia + "/" + mes + "/" + año + " " + hora + ":" + min;
    }

    // ==========================================
    // LOGS — escritura silenciosa a Strapi
    // ==========================================
    function registrarLog(accion, tipo, turno) {
        tipo  = tipo  || "actividad";
        turno = turno || null;
        var payload = {
            data: {
                Tipo:      tipo,
                Usuario:   usuarioActual ? (usuarioActual.username || "Sistema") : "Sistema",
                Accion:    accion,
                Turno:     turno,
            },
        };
        // Fire-and-forget: no bloquea al usuario si falla
        fetch(STRAPI_URL + "/logs", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        }).catch(function (e) {
            console.warn("No se pudo registrar log:", e.message);
        });
    }

    // ==========================================
    // BOTON DE INVENTARIO con badge de stock
    // ==========================================
    function crearBotonItem(attr, onClickHandler) {
        const cantidad = (attr.Cantidad !== undefined && attr.Cantidad !== null)
            ? Number(attr.Cantidad)
            : null;
        const sinStock = cantidad !== null && cantidad <= 0;

        const btn = document.createElement("button");
        btn.className = "btn-item has-image" + (sinStock ? " sin-stock" : "");
        btn.disabled = sinStock;

        // Imagen o fallback
        const imagenData = attr.Img || attr.img;
        let imageUrl = null;
        if (imagenData) {
            if (imagenData.url) {
                imageUrl = imagenData.url;
            } else if (imagenData.data) {
                const imgAttrs = imagenData.data.attributes || imagenData.data;
                imageUrl = imgAttrs.url;
            }
        }
        if (imageUrl) {
            const img = document.createElement("img");
            img.src = imageUrl.startsWith("http") ? imageUrl : STRAPI_BASE + imageUrl;
            img.alt = attr.Nombre;
            img.className = "item-img";
            btn.appendChild(img);
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "item-img item-img-fallback";
            placeholder.textContent = "📦";
            btn.appendChild(placeholder);
        }

        // Texto
        const textContainer = document.createElement("div");
        textContainer.className = "item-text";
        const nameSpan = document.createElement("span");
        nameSpan.className = "item-name";
        nameSpan.textContent = attr.Nombre;
        const binSpan = document.createElement("small");
        binSpan.className = "item-bin";
        binSpan.textContent = "(" + attr.Codigo_Bin + ")";
        textContainer.appendChild(nameSpan);
        textContainer.appendChild(binSpan);
        btn.appendChild(textContainer);

        // Badge de stock
        if (cantidad !== null) {
            const badge = document.createElement("span");
            var badgeClass = "stock-badge ";
            if (sinStock)           badgeClass += "stock-badge--vacio";
            else if (cantidad <= 3) badgeClass += "stock-badge--bajo";
            else                    badgeClass += "stock-badge--ok";
            badge.className   = badgeClass;
            badge.textContent = sinStock ? "Sin stock" : String(cantidad);
            btn.appendChild(badge);
        }

        if (sinStock) {
            btn.addEventListener("click", function () {
                mostrarDialogo("Sin Stock", "No hay unidades disponibles de \"" + attr.Nombre + "\".");
            });
        } else {
            btn.addEventListener("click", onClickHandler);
        }
        return btn;
    }

    // ==========================================
    // 1. DETECCIÓN DE ENTORNO
    // ==========================================
    const esKioscoLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

    if (esKioscoLocal) {
        txtModo.textContent = "Servidor Almacén";
        iniciarPollingAlertas();
        iniciarSistemaCortes();
    } else {
        txtModo.textContent = "Terminal Remota";
    }

    // ==========================================
    // 2. AUTENTICACIÓN
    // ==========================================
    async function iniciarSesionManual(event) {
        if (event) event.preventDefault();
        const user = inputUser.value.trim();
        const pass = inputPass.value.trim();

        if (!user || !pass) {
            await mostrarDialogo("Atención", "Ingrese usuario y contraseña.");
            return;
        }

        btnLogin.disabled    = true;
        btnLogin.textContent = "Ingresando...";
        loader.classList.remove("hidden");

        try {
            const response = await fetch(STRAPI_URL + "/auth/local", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ identifier: user, password: pass }),
            });

            const data = await response.json();
            if (data.error) {
                await mostrarDialogo("Acceso Denegado", data.error.message);
                return;
            }

            const empleado = data.user;
            if (!empleado.Area) empleado.Area = "Sin Asignar";
            empleado.jwt = data.jwt;

            inputUser.value = "";
            inputPass.value = "";
            usuarioActual   = empleado;
            sessionStorage.setItem("sesion", JSON.stringify(empleado));

            await cargarInventario(empleado.Area);

            lblNombre.textContent = "Hola, " + empleado.username;
            lblArea.textContent   = "Área: " + (empleado.Area === "Almacen" ? "Almacén (Superusuario)" : empleado.Area);

            // Si es kiosco local Y es almacenista: mostrar botón Panel Admin en dashboard
            var esAdmin = esKioscoLocal && empleado.Area === "Almacen";
            if (esAdmin) {
                btnIrAdmin.classList.remove("hidden");
            } else {
                btnIrAdmin.classList.add("hidden");
            }

            cambiarPantalla(screens.login, screens.dashboard);

            registrarLog("Inicio de sesión");

        } catch (error) {
            console.error("Error en login:", error);
            await mostrarDialogo("Error de Conexión", "No se pudo comunicar con el servidor Strapi.");
        } finally {
            loader.classList.add("hidden");
            btnLogin.disabled    = false;
            btnLogin.textContent = "Ingresar";
        }
    }

    async function cerrarSesion() {
        const confirmar = await mostrarDialogo("Cerrar Sesión", "¿Está seguro que desea salir del sistema?", true);
        if (!confirmar) return;

        registrarLog("Cierre de sesión");

        usuarioActual = null;
        gridBotones.innerHTML = "";
        sessionStorage.removeItem("sesion");
        limpiarCarrito();

        // Volver al login desde cualquier pantalla activa
        [screens.dashboard, screens.admin].forEach(function (s) {
            s.classList.remove("active");
            s.classList.add("hidden");
        });
        screens.login.classList.remove("hidden");
        screens.login.classList.add("active");
    }

    function restaurarSesion() {
        const datos = sessionStorage.getItem("sesion");
        if (!datos) return;
        try {
            const empleado = JSON.parse(datos);
            usuarioActual   = empleado;
            lblNombre.textContent = "Hola, " + (empleado.username || "Operador");
            lblArea.textContent   = "Área: " + (empleado.Area === "Almacen" ? "Almacén (Superusuario)" : empleado.Area);

            var esAdmin = esKioscoLocal && empleado.Area === "Almacen";
            if (esAdmin) btnIrAdmin.classList.remove("hidden");

            cargarInventario(empleado.Area);
            cambiarPantalla(screens.login, screens.dashboard);
        } catch (e) {
            sessionStorage.removeItem("sesion");
        }
    }

    // ==========================================
    // 3. INVENTARIO Y CARRITO
    // ==========================================
    async function cargarInventario(areaUsuario) {
        try {
            const urlInventario = areaUsuario === "Almacen"
                ? STRAPI_URL + "/inventarios?populate=Img&pagination[pageSize]=100"
                : STRAPI_URL + "/inventarios?filters[Area_Permitida][$eq]=" + encodeURIComponent(areaUsuario) + "&populate=Img&pagination[pageSize]=100";

            const data  = await fetchJSON(urlInventario);
            const items = data.data || [];
            gridBotones.innerHTML = "";

            if (items.length === 0) {
                mostrarErrorEnGrid("No hay componentes asignados a esta área.");
                return;
            }

            items.forEach(function (item) {
                const attr     = getAttributes(item);
                attr._strapiId = item.documentId || item.id;
                const btn = crearBotonItem(attr, function () {
                    agregarAlCarrito(attr.Codigo_Bin, attr.Nombre, attr._strapiId, attr.Cantidad);
                });
                gridBotones.appendChild(btn);
            });
        } catch (error) {
            console.error("Error cargando inventario:", error);
            mostrarErrorEnGrid("Error al cargar inventario. Verifique la conexión.");
        }
    }

    async function agregarAlCarrito(codigoBin, nombreItem, strapiId, cantidadActual) {
        if (carrito.find(function (i) { return i.bin === codigoBin; })) {
            await mostrarDialogo("Elemento Duplicado", "📦 Este componente ya está en la lista de extracción.");
            return;
        }

        loader.classList.remove("hidden");
        try {
            const resBin = await fetchJSON(
                STRAPI_URL + "/bins?filters[BIN_ID][$eq]=" + encodeURIComponent(codigoBin)
            );

            if (!resBin.data || resBin.data.length === 0) {
                await mostrarDialogo("Base de Datos", "No se encontraron coordenadas para el bin: " + codigoBin);
                return;
            }

            const coord = getAttributes(resBin.data[0]);
            carrito.push({
                nombre:   nombreItem,
                bin:      codigoBin,
                x:        coord.Coord_X || coord.COORD_X,
                z:        coord.Coord_Z || coord.COORD_Z,
                strapiId: strapiId,
                cantidad: cantidadActual,
                pedido:   1,
            });

            renderizarCarrito();
        } catch (error) {
            console.error("Error al obtener bin:", error);
            await mostrarDialogo("Error de Red", "Fallo de conexión al verificar el componente.");
        } finally {
            loader.classList.add("hidden");
        }
    }

    function limpiarCarrito() {
        carrito = [];
        const panel = document.getElementById("panel-carrito");
        if (panel) {
            panel.classList.add("hidden");
            panel.innerHTML = "";
        }
    }

    function renderizarCarrito() {
        let panel = document.getElementById("panel-carrito");

        if (!panel) {
            panel = document.createElement("div");
            panel.id        = "panel-carrito";
            panel.className = "panel-carrito";
            const inventorySection = document.querySelector(".inventory-section");
            inventorySection.insertBefore(panel, gridBotones);
        }

        if (carrito.length === 0) {
            panel.classList.add("hidden");
            panel.innerHTML = "";
            return;
        }

        panel.classList.remove("hidden");
        panel.innerHTML = "";

        const totalPiezasInicial = carrito.reduce(function (acc, i) { return acc + i.pedido; }, 0);
        const titulo = document.createElement("h3");
        titulo.className   = "carrito-titulo";
        titulo.textContent = "🛒 Lista de Extracción (" + carrito.length + " item(s), " + totalPiezasInicial + " pieza(s))";
        panel.appendChild(titulo);

        const ul = document.createElement("ul");
        ul.className = "carrito-lista";

        carrito.forEach(function (item, index) {
            const li = document.createElement("li");
            li.className = "carrito-item";

            // Info
            const infoSpan = document.createElement("span");
            infoSpan.className = "carrito-item-info";
            infoSpan.appendChild(document.createTextNode("📦 " + item.nombre + " "));
            const binSmall = document.createElement("small");
            binSmall.className   = "carrito-item-bin";
            binSmall.textContent = "(" + item.bin + ")";
            infoSpan.appendChild(binSmall);

            // Control de cantidad
            const stockMax = (item.cantidad !== null && item.cantidad !== undefined)
                ? Number(item.cantidad) : 999;

            const ctrlCantidad = document.createElement("div");
            ctrlCantidad.className = "carrito-item-cantidad";

            const btnMenos = document.createElement("button");
            btnMenos.className = "carrito-cantidad-btn";
            btnMenos.textContent = "−";
            btnMenos.setAttribute("aria-label", "Reducir cantidad de " + item.nombre);

            const inputCantidad = document.createElement("input");
            inputCantidad.type      = "number";
            inputCantidad.className = "carrito-cantidad-input";
            inputCantidad.value     = item.pedido;
            inputCantidad.min       = "1";
            inputCantidad.max       = String(stockMax);
            inputCantidad.setAttribute("aria-label", "Cantidad de " + item.nombre);

            const btnMas = document.createElement("button");
            btnMas.className = "carrito-cantidad-btn";
            btnMas.textContent = "+";
            btnMas.setAttribute("aria-label", "Aumentar cantidad de " + item.nombre);

            function actualizarPedido(nuevoValor) {
                var val = parseInt(nuevoValor, 10);
                if (isNaN(val) || val < 1) val = 1;
                if (val > stockMax)        val = stockMax;
                carrito[index].pedido = val;
                inputCantidad.value   = val;
                btnMenos.disabled = val <= 1;
                btnMas.disabled   = val >= stockMax;
                const totalPiezas = carrito.reduce(function (acc, i) { return acc + i.pedido; }, 0);
                titulo.textContent = "🛒 Lista de Extracción (" + carrito.length + " item(s), " + totalPiezas + " pieza(s))";
            }

            btnMenos.disabled = item.pedido <= 1;
            btnMas.disabled   = item.pedido >= stockMax;

            btnMenos.addEventListener("click",   function () { actualizarPedido(carrito[index].pedido - 1); });
            btnMas.addEventListener("click",     function () { actualizarPedido(carrito[index].pedido + 1); });
            inputCantidad.addEventListener("input", function () { actualizarPedido(this.value); });
            inputCantidad.addEventListener("wheel", function (e) { e.preventDefault(); });

            ctrlCantidad.appendChild(btnMenos);
            ctrlCantidad.appendChild(inputCantidad);
            ctrlCantidad.appendChild(btnMas);

            // Quitar
            const btnQuitar = document.createElement("button");
            btnQuitar.className = "carrito-btn-quitar";
            btnQuitar.textContent = "❌";
            btnQuitar.setAttribute("aria-label", "Quitar " + item.nombre);
            btnQuitar.addEventListener("click", function () {
                carrito.splice(index, 1);
                renderizarCarrito();
            });

            li.appendChild(infoSpan);
            li.appendChild(ctrlCantidad);
            li.appendChild(btnQuitar);
            ul.appendChild(li);
        });

        panel.appendChild(ul);

        const btnEnviar = document.createElement("button");
        btnEnviar.className   = "btn-confirmar-orden";
        btnEnviar.textContent = "🚀 CONFIRMAR ORDEN Y EXTRAER";
        btnEnviar.addEventListener("click", enviarOrdenCarrito);
        panel.appendChild(btnEnviar);
    }

    async function enviarOrdenCarrito() {
        if (carrito.length === 0) return;

        const totalPiezas = carrito.reduce(function (acc, i) { return acc + i.pedido; }, 0);
        const confirmar   = await mostrarDialogo(
            "Confirmar Orden",
            "¿Iniciar extracción de " + carrito.length + " item(s), " + totalPiezas + " pieza(s) en total?",
            true
        );
        if (!confirmar) return;

        const arregloCoordenadas = carrito.map(function (item) {
            return { x: parseInt(item.x) || 0, z: parseInt(item.z) || 0 };
        });

        loader.classList.remove("hidden");

        try {
            // 1. Enviar coordenadas al ESP32
            await fetchJSON(Carlitos + "api/order", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(arregloCoordenadas),
            });

            // 2. Por cada item: crear orden en Strapi con Item_Nombre y Cantidad_Pedida
            //    + decrementar stock en inventario — todo en paralelo
            var operaciones = carrito
                .filter(function (item) { return item.strapiId; })
                .map(function (item) {
                    var nuevaCantidad = Math.max(0, (Number(item.cantidad) || 0) - item.pedido);

                    var crearOrden = fetchJSON(STRAPI_URL + "/ordenes", {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: {
                            Bin_Solicitado:      item.bin,
                            Estado:              "Completada",
                            Usuario_Solicitante: usuarioActual.username,
                            Item_Nombre:         item.nombre,
                            Cantidad_Pedida:     item.pedido,
                        }}),
                    });

                    var decrementarStock = fetchJSON(STRAPI_URL + "/inventarios/" + item.strapiId, {
                        method:  "PUT",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify({ data: { Cantidad: nuevaCantidad } }),
                    });

                    return Promise.all([crearOrden, decrementarStock]);
                });

            await Promise.allSettled(operaciones);

            // 3. Registrar log de actividad
            var detalleOrden = carrito.map(function (i) {
                return i.pedido + "x " + i.nombre + " (" + i.bin + ")";
            }).join(", ");
            registrarLog("Orden enviada — " + detalleOrden + " — Total: " + totalPiezas + " pieza(s)");

            await mostrarDialogo(
                "¡Orden Procesada!",
                "🤖 Instrucciones enviadas al sistema CNC.\nSe extraerán " + totalPiezas + " pieza(s) de " + carrito.length + " item(s) del almacén."
            );

            limpiarCarrito();
            await cargarInventario(usuarioActual.Area);

        } catch (error) {
            console.error("Error procesando orden:", error);
            await mostrarDialogo(
                "Fallo de Comunicación",
                "No se pudo enviar la orden. Verifique que el módulo ESP32 (Carlitos) esté en línea."
            );
        } finally {
            loader.classList.add("hidden");
        }
    }

    // ==========================================
    // 4. SISTEMA ANDON
    // ==========================================
    function abrirModalAyuda() {
        modalAyuda.classList.remove("hidden");
        txtProblema.value = "";
        txtProblema.focus();
    }

    function cerrarModalAyuda() {
        modalAyuda.classList.add("hidden");
    }

    async function enviarAlerta() {
        const problema = txtProblema.value.trim();
        if (!problema) {
            await mostrarDialogo("Campo Vacío", "Por favor, describa brevemente el problema.");
            return;
        }
        if (!usuarioActual) {
            await mostrarDialogo("Error de Sesión", "No hay una sesión de operador activa.");
            return;
        }

        const paqueteAlerta = {
            data: {
                Usuario: usuarioActual.username || "Operador",
                Area:    usuarioActual.Area,
                Mensaje: problema,
                Estado:  "Pendiente",
            },
        };

        try {
            await fetchJSON(STRAPI_URL + "/alertas", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(paqueteAlerta),
            });
            registrarLog("Alerta de asistencia enviada: " + problema);
            cerrarModalAyuda();
            await mostrarDialogo("Alerta Registrada", "🚨 El equipo de Almacén ha sido notificado y la estación fue bloqueada temporalmente.");
        } catch (error) {
            console.error("Error al enviar alerta:", error);
            await mostrarDialogo("Fallo de Sistema", "No se pudo registrar la alerta en Strapi.");
        }
    }

    // ==========================================
    // 5. POLLING ALERTAS ANDON
    // ==========================================
    function iniciarPollingAlertas() {
        pollingRetrasos = 0;
        programarSiguientePoll();
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                if (pollingIntervalID) { clearTimeout(pollingIntervalID); pollingIntervalID = null; }
            } else {
                pollingRetrasos = 0;
                revisarAlertasAndon();
                programarSiguientePoll();
            }
        });
    }

    function programarSiguientePoll() {
        if (pollingIntervalID) clearTimeout(pollingIntervalID);
        var intervalo = Math.min(3000 * Math.pow(2, pollingRetrasos), 30000);
        pollingIntervalID = setTimeout(function () {
            revisarAlertasAndon().then(programarSiguientePoll);
        }, intervalo);
    }

    async function revisarAlertasAndon() {
        if (pollingEnCurso) return;
        pollingEnCurso = true;
        try {
            const data = await fetchJSON(
                STRAPI_URL + "/alertas?filters[Estado][$eq]=Pendiente&pagination[limit]=1"
            );
            pollingRetrasos = 0;
            if (data.data && data.data.length > 0) {
                const alerta = data.data[0];
                alertaActivaID = alerta.documentId || alerta.id;
                const attr     = getAttributes(alerta);
                alertaQuien.textContent   = "El usuario " + attr.Usuario + " (Área: " + attr.Area + ") requiere asistencia.";
                alertaMensaje.textContent = attr.Mensaje;
                alertaBloqueante.classList.remove("hidden");
            }
        } catch (error) {
            console.warn("Error en polling de alertas:", error.message);
            pollingRetrasos = Math.min(pollingRetrasos + 1, 4);
        } finally {
            pollingEnCurso = false;
        }
    }

    async function resolverAlerta() {
        if (!alertaActivaID) return;
        try {
            await fetchJSON(STRAPI_URL + "/alertas/" + alertaActivaID, {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ data: { Estado: "Atendida" } }),
            });
            registrarLog("Alerta resuelta (ID: " + alertaActivaID + ")");
            alertaBloqueante.classList.add("hidden");
            alertaActivaID = null;
        } catch (error) {
            console.error("Error al resolver alerta:", error);
            await mostrarDialogo("Error", "No se pudo cerrar la alerta en la base de datos.");
        }
    }

    // ==========================================
    // 6. SISTEMA DE CORTES AUTOMÁTICOS
    // ==========================================
    var HORAS_CORTE = [
        { hora: 8,  minuto: 0, turno: "Manana",  label: "Mañana (hasta 8:00 AM)",  prevHora: 18 },
        { hora: 14, minuto: 0, turno: "Tarde",   label: "Tarde (8:00 AM - 2:00 PM)", prevHora: 8  },
        { hora: 18, minuto: 0, turno: "Noche",   label: "Noche (2:00 PM - 6:00 PM)", prevHora: 14 },
    ];

    function iniciarSistemaCortes() {
        // Revisar cada 60 segundos
        setInterval(verificarCorte, 60000);
    }

    async function verificarCorte() {
        var ahora   = new Date();
        var horaAct = ahora.getHours();
        var minAct  = ahora.getMinutes();

        for (var i = 0; i < HORAS_CORTE.length; i++) {
            var corte = HORAS_CORTE[i];
            if (horaAct !== corte.hora || minAct !== 0) continue;

            // Clave única: turno + fecha de hoy
            var claveHoy = "corte_" + corte.turno + "_" + ahora.toDateString();
            if (localStorage.getItem(claveHoy)) continue; // ya se generó hoy

            await generarCorte(corte, ahora);
            localStorage.setItem(claveHoy, "1");
            break;
        }
    }

    async function generarCorte(corte, ahora) {
        try {
            // Calcular rango: desde corte anterior hasta ahora
            var desde = new Date(ahora);
            desde.setHours(corte.prevHora, 0, 0, 0);
            // Si la hora de inicio es mayor que la actual, es del día anterior
            if (corte.prevHora >= corte.hora) {
                desde.setDate(desde.getDate() - 1);
            }

            var urlOrdenes = STRAPI_URL
                + "/ordenes?filters[createdAt][$gte]=" + encodeURIComponent(desde.toISOString())
                + "&filters[createdAt][$lte]=" + encodeURIComponent(ahora.toISOString())
                + "&pagination[pageSize]=200";

            var data   = await fetchJSON(urlOrdenes);
            var ordenes = data.data || [];

            var resumen;
            if (ordenes.length === 0) {
                resumen = "Sin órdenes registradas en este turno.";
            } else {
                resumen = ordenes.map(function (o) {
                    var a = getAttributes(o);
                    return (a.Usuario_Solicitante || "?") + " solicitó "
                        + (a.Cantidad_Pedida || 1) + "x "
                        + (a.Item_Nombre || a.Bin_Solicitado || "?")
                        + " [" + (a.Bin_Solicitado || "") + "]"
                        + " — " + formatearFecha(o.createdAt || a.createdAt);
                }).join(" | ");
            }

            registrarLog(
                "CORTE DE TURNO — " + corte.label + " — " + ordenes.length + " orden(es). Detalle: " + resumen,
                "corte",
                corte.turno
            );

            console.log("✅ Corte de turno generado:", corte.turno);
        } catch (e) {
            console.error("Error generando corte:", e);
        }
    }

    // ==========================================
    // 7. PANEL DE ADMINISTRADOR
    // ==========================================

    function mostrarPanelAdmin() {
        adminLblUsuario.textContent = usuarioActual.username;
        cambiarPantalla(screens.dashboard, screens.admin);
        // Activar tab de inventario por defecto
        cambiarTabAdmin("inventario");
        cargarInventarioAdmin();
        registrarLog("Acceso al Panel de Administrador");
    }

    function cambiarTabAdmin(tabNombre) {
        // Tabs
        ["inventario", "actividad", "cortes"].forEach(function (t) {
            var tab     = document.getElementById("tab-" + t);
            var content = document.getElementById("admin-" + t);
            if (t === tabNombre) {
                tab.classList.add("active");
                tab.setAttribute("aria-selected", "true");
                content.classList.remove("hidden");
            } else {
                tab.classList.remove("active");
                tab.setAttribute("aria-selected", "false");
                content.classList.add("hidden");
            }
        });
    }

    // --- Tab Inventario ---
    async function cargarInventarioAdmin() {
        adminInvContainer.innerHTML = "<p class='accent-text'>Cargando...</p>";
        try {
            const data  = await fetchJSON(STRAPI_URL + "/inventarios?populate=Img&pagination[pageSize]=100");
            const items = data.data || [];

            if (items.length === 0) {
                adminInvContainer.innerHTML = "<p>No hay items en inventario.</p>";
                return;
            }

            const tabla = document.createElement("table");
            tabla.className = "admin-tabla";

            const thead = tabla.createTHead();
            var encabezados = ["Nombre", "Bin", "Área", "Stock Actual", "Nueva Cantidad", ""];
            var trHead = thead.insertRow();
            encabezados.forEach(function (txt) {
                var th = document.createElement("th");
                th.textContent = txt;
                trHead.appendChild(th);
            });

            const tbody = tabla.createTBody();
            items.forEach(function (item) {
                const attr     = getAttributes(item);
                const strapiId = item.documentId || item.id;
                const cantActual = Number(attr.Cantidad) || 0;

                var tr = tbody.insertRow();

                // Nombre
                var tdNombre = tr.insertCell();
                tdNombre.textContent = attr.Nombre || "—";

                // Bin
                var tdBin = tr.insertCell();
                tdBin.textContent = attr.Codigo_Bin || "—";
                tdBin.className   = "admin-td-muted";

                // Área
                var tdArea = tr.insertCell();
                tdArea.textContent = attr.Area_Permitida || "Almacén";
                tdArea.className   = "admin-td-muted";

                // Stock actual
                var tdStock = tr.insertCell();
                var stockSpan = document.createElement("span");
                stockSpan.className   = "stock-badge " + (cantActual <= 0 ? "stock-badge--vacio" : cantActual <= 3 ? "stock-badge--bajo" : "stock-badge--ok");
                stockSpan.textContent = cantActual;
                tdStock.appendChild(stockSpan);
                tdStock.style.textAlign = "center";

                // Input nueva cantidad
                var tdInput = tr.insertCell();
                var input   = document.createElement("input");
                input.type      = "number";
                input.className = "admin-input-cantidad";
                input.value     = cantActual;
                input.min       = String(cantActual); // no puede bajar
                input.setAttribute("data-original", cantActual);
                tdInput.appendChild(input);

                // Botón actualizar
                var tdBtn = tr.insertCell();
                var btn   = document.createElement("button");
                btn.className   = "btn-admin-actualizar";
                btn.textContent = "Actualizar";
                btn.addEventListener("click", function () {
                    var nuevaVal = parseInt(input.value, 10);
                    if (isNaN(nuevaVal) || nuevaVal < cantActual) {
                        mostrarDialogo("Valor Inválido", "La nueva cantidad debe ser mayor o igual a " + cantActual + ".");
                        return;
                    }
                    if (nuevaVal === cantActual) {
                        mostrarDialogo("Sin cambios", "El valor ingresado es igual al stock actual.");
                        return;
                    }
                    actualizarCantidadAdmin(strapiId, cantActual, nuevaVal, attr.Nombre, tr, stockSpan, input);
                });
                tdBtn.appendChild(btn);

                tbody.appendChild(tr);
            });

            adminInvContainer.innerHTML = "";
            adminInvContainer.appendChild(tabla);

        } catch (error) {
            console.error("Error cargando inventario admin:", error);
            adminInvContainer.innerHTML = "<p class='accent-text'>Error al cargar inventario.</p>";
        }
    }

    async function actualizarCantidadAdmin(strapiId, cantidadAnterior, nuevaCantidad, nombre, tr, stockSpan, input) {
        try {
            await fetchJSON(STRAPI_URL + "/inventarios/" + strapiId, {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ data: { Cantidad: nuevaCantidad } }),
            });

            // Actualizar visualmente la fila sin recargar toda la tabla
            stockSpan.textContent = nuevaCantidad;
            stockSpan.className   = "stock-badge " + (nuevaCantidad <= 0 ? "stock-badge--vacio" : nuevaCantidad <= 3 ? "stock-badge--bajo" : "stock-badge--ok");
            input.min   = String(nuevaCantidad);
            input.value = nuevaCantidad;
            input.setAttribute("data-original", nuevaCantidad);

            // Flash verde en la fila para feedback visual
            tr.classList.add("admin-fila-ok");
            setTimeout(function () { tr.classList.remove("admin-fila-ok"); }, 1500);

            registrarLog(
                "Stock actualizado: " + nombre + " — " + cantidadAnterior + " → " + nuevaCantidad
            );

        } catch (error) {
            console.error("Error actualizando cantidad:", error);
            await mostrarDialogo("Error", "No se pudo actualizar el stock de " + nombre + ".");
        }
    }

    // --- Tab Actividad ---
    async function cargarLogsActividad() {
        adminActContainer.innerHTML = "<p class='accent-text'>Cargando...</p>";
        try {
            const data = await fetchJSON(
                STRAPI_URL + "/logs?filters[Tipo][$eq]=actividad&sort=createdAt:desc&pagination[pageSize]=50"
            );
            const logs = data.data || [];

            if (logs.length === 0) {
                adminActContainer.innerHTML = "<p>No hay registros de actividad.</p>";
                return;
            }

            const tabla = document.createElement("table");
            tabla.className = "admin-tabla";

            const thead = tabla.createTHead();
            var trHead  = thead.insertRow();
            ["Fecha / Hora", "Usuario", "Acción"].forEach(function (txt) {
                var th = document.createElement("th");
                th.textContent = txt;
                trHead.appendChild(th);
            });

            const tbody = tabla.createTBody();
            logs.forEach(function (log) {
                const attr = getAttributes(log);
                var tr = tbody.insertRow();

                var tdFecha = tr.insertCell();
                tdFecha.textContent = formatearFecha(log.createdAt || attr.createdAt);
                tdFecha.className   = "admin-td-muted";

                var tdUser = tr.insertCell();
                var userSpan = document.createElement("span");
                userSpan.className   = "log-tag log-tag--actividad";
                userSpan.textContent = attr.Usuario || "—";
                tdUser.appendChild(userSpan);

                var tdAccion = tr.insertCell();
                tdAccion.textContent = attr.Accion || "—";
            });

            adminActContainer.innerHTML = "";
            adminActContainer.appendChild(tabla);

        } catch (error) {
            console.error("Error cargando logs actividad:", error);
            adminActContainer.innerHTML = "<p class='accent-text'>Error al cargar registros.</p>";
        }
    }

    // --- Tab Cortes ---
    async function cargarLogsCorte() {
        adminCorContainer.innerHTML = "<p class='accent-text'>Cargando...</p>";
        try {
            const data = await fetchJSON(
                STRAPI_URL + "/logs?filters[Tipo][$eq]=corte&sort=createdAt:desc&pagination[pageSize]=50"
            );
            const logs = data.data || [];

            if (logs.length === 0) {
                adminCorContainer.innerHTML = "<p>No hay cortes registrados aún. Los cortes se generan automáticamente a las 8:00 AM, 2:00 PM y 6:00 PM.</p>";
                return;
            }

            const tabla = document.createElement("table");
            tabla.className = "admin-tabla";

            const thead = tabla.createTHead();
            var trHead  = thead.insertRow();
            ["Fecha / Hora", "Turno", "Resumen del Turno"].forEach(function (txt) {
                var th = document.createElement("th");
                th.textContent = txt;
                trHead.appendChild(th);
            });

            const tbody = tabla.createTBody();
            logs.forEach(function (log) {
                const attr = getAttributes(log);
                var tr = tbody.insertRow();

                var tdFecha = tr.insertCell();
                tdFecha.textContent = formatearFecha(log.createdAt || attr.createdAt);
                tdFecha.className   = "admin-td-muted";

                var tdTurno = tr.insertCell();
                var turnoSpan = document.createElement("span");
                turnoSpan.className   = "log-tag log-tag--corte";
                turnoSpan.textContent = attr.Turno || "—";
                tdTurno.appendChild(turnoSpan);

                var tdResumen = tr.insertCell();
                tdResumen.className   = "admin-td-resumen";
                tdResumen.textContent = attr.Accion || "—";
            });

            adminCorContainer.innerHTML = "";
            adminCorContainer.appendChild(tabla);

        } catch (error) {
            console.error("Error cargando logs corte:", error);
            adminCorContainer.innerHTML = "<p class='accent-text'>Error al cargar cortes.</p>";
        }
    }

    // ==========================================
    // 8. TEMA
    // ==========================================
    if (checkboxTheme) {
        var currentTheme = localStorage.getItem("theme");
        if (currentTheme) {
            document.body.classList.add(currentTheme);
            if (currentTheme === "light-theme") checkboxTheme.checked = true;
        }
        checkboxTheme.addEventListener("change", function (e) {
            document.body.classList.toggle("light-theme", e.target.checked);
            localStorage.setItem("theme", e.target.checked ? "light-theme" : "dark-theme");
        });
    }

    // ==========================================
    // 9. EVENT LISTENERS
    // ==========================================
    if (formLogin)        formLogin.addEventListener("submit",  iniciarSesionManual);
    if (btnLogout)        btnLogout.addEventListener("click",   cerrarSesion);
    if (btnIrAdmin)       btnIrAdmin.addEventListener("click",  mostrarPanelAdmin);
    if (btnEmergency)     btnEmergency.addEventListener("click", abrirModalAyuda);
    if (btnEnviarAlerta)  btnEnviarAlerta.addEventListener("click",  enviarAlerta);
    if (btnCancelarAyuda) btnCancelarAyuda.addEventListener("click", cerrarModalAyuda);
    if (btnResolverAlerta) btnResolverAlerta.addEventListener("click", resolverAlerta);
    if (btnAdminVolver)   btnAdminVolver.addEventListener("click", function () {
        cambiarPantalla(screens.admin, screens.dashboard);
    });

    // Tabs del panel admin
    document.getElementById("tab-inventario").addEventListener("click", function () {
        cambiarTabAdmin("inventario");
        cargarInventarioAdmin();
    });
    document.getElementById("tab-actividad").addEventListener("click", function () {
        cambiarTabAdmin("actividad");
        cargarLogsActividad();
    });
    document.getElementById("tab-cortes").addEventListener("click", function () {
        cambiarTabAdmin("cortes");
        cargarLogsCorte();
    });

    // Botones recargar
    if (btnAdminReloadInv) btnAdminReloadInv.addEventListener("click", cargarInventarioAdmin);
    if (btnAdminReloadAct) btnAdminReloadAct.addEventListener("click", cargarLogsActividad);
    if (btnAdminReloadCor) btnAdminReloadCor.addEventListener("click", cargarLogsCorte);

    modalAyuda.addEventListener("keydown", function (e) {
        if (e.key === "Escape") cerrarModalAyuda();
    });

    // ==========================================
    // 10. INIT
    // ==========================================
    restaurarSesion();
})();
