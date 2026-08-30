let botonSeleccionadoId = null;
let modoEdicionActual = "completo"; 
let map = null;
let marker = null;
let geocoderControl = null;
let coordenadaTemporal = null;
let sortableInstance = null;
let estaArrastrando = false;
let deferredPrompt = null;

// Registrar Service Worker para permitir Share Target (Google Maps / Waze)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado con éxito', reg))
            .catch(err => console.log('Error al registrar el Service Worker', err));
    });
}

function obtenerDispositivo() {
    const ua = navigator.userAgent;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "movil";
    return "pc";
}

function obtenerTotalBotones() {
    let total = localStorage.getItem("total_botones");
    return total ? parseInt(total) : 1;
}

window.onload = function() {
    const infoDispositivo = document.getElementById("info-dispositivo");
    if (infoDispositivo) {
        infoDispositivo.innerText = "Dispositivo: " + obtenerDispositivo().toUpperCase();
    }
    
    procesarEnlaceCompartidoExterno();
    renderizarBotones();
    configurarInstalacionPWA();
};

function procesarEnlaceCompartidoExterno() {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');

    if (sharedUrl) {
        let total = obtenerTotalBotones();
        let dispositivo = obtenerDispositivo();

        localStorage.setItem("ubicacion_nav_btn_" + total, sharedUrl);
        localStorage.setItem("ubicacion_" + dispositivo + "_btn_" + total, sharedUrl);
        localStorage.setItem("nombre_btn_" + total, "Ubicación compartida");
        localStorage.setItem("total_botones", total + 1);

        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function configurarInstalacionPWA() {
    const btnInstalar = document.getElementById('btn-instalar-app');

    // Por defecto ocultamos el botón hasta que el navegador permita la instalación 
    // o detectemos que no está en modo standalone.
    if (btnInstalar) {
        btnInstalar.style.display = 'none';
    }

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        if (btnInstalar) btnInstalar.style.display = 'none';
        return;
    }

    // Escuchamos el evento automático del navegador
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (btnInstalar) btnInstalar.style.display = 'block'; // Mostrar solo cuando el navegador lo permita
    });

    if (btnInstalar) {
        btnInstalar.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    console.log('Usuario aceptó instalar la app');
                }
                deferredPrompt = null;
                btnInstalar.style.display = 'none';
            } else {
                alert("Para instalar la app, toca los tres puntos (⋮) en la esquina superior derecha de tu navegador y selecciona 'Añadir a la pantalla de inicio' o 'Instalar aplicación'.");
            }
        });
    }
}

function renderizarBotones() {
    const contenedor = document.getElementById("contenedor-botones");
    if (!contenedor) return;
    contenedor.innerHTML = "";
    let total = obtenerTotalBotones();
    let dispositivo = obtenerDispositivo();

    for (let i = 1; i <= total; i++) {
        let nombreGuardado = localStorage.getItem("nombre_btn_" + i);
        let enlaceNav = localStorage.getItem("ubicacion_nav_btn_" + i);
        let enlaceLocal = localStorage.getItem("ubicacion_" + dispositivo + "_btn_" + i);
        
        let textoEtiqueta = nombreGuardado ? nombreGuardado : "Nuevo";
        let estaConfigurado = (enlaceNav || enlaceLocal);

        let grupo = document.createElement("div");
        grupo.className = "item-group";
        grupo.setAttribute("data-id", i);

        if (!estaConfigurado) {
            grupo.classList.add("no-sort");
            grupo.setAttribute("data-fixed", "true");
        }

        let btn = document.createElement("button");
        btn.innerHTML = estaConfigurado ? "📍" : "+";
        if (estaConfigurado) btn.style.backgroundColor = "#28a745";
        
        btn.onclick = function() {
            if (estaArrastrando) return;

            if (estaConfigurado) {
                let enlace = localStorage.getItem("ubicacion_nav_btn_" + i) || localStorage.getItem("ubicacion_" + dispositivo + "_btn_" + i);
                if (enlace) window.open(enlace, "_blank");
            } else {
                abrirModalConfiguracion(i, "completo");
            }
        };

        let pressTimer = null;
        let iniciarPresion = function() {
            if (!estaConfigurado || estaArrastrando) return; 
            
            pressTimer = setTimeout(function() {
                if (!estaArrastrando) {
                    abrirModalOpciones(i, textoEtiqueta);
                }
            }, 800);
        };

        let cancelarPresion = function() {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        btn.addEventListener('mousedown', iniciarPresion);
        btn.addEventListener('touchstart', iniciarPresion, {passive: true});
        btn.addEventListener('mouseup', cancelarPresion);
        btn.addEventListener('mouseleave', cancelarPresion);
        btn.addEventListener('touchend', cancelarPresion);
        btn.addEventListener('touchmove', cancelarPresion);

        let p = document.createElement("p");
        p.className = "label-text";
        p.innerText = textoEtiqueta;
        p.title = textoEtiqueta;

        grupo.appendChild(btn);
        grupo.appendChild(p);
        contenedor.appendChild(grupo);
    }

    inicializarSortable();
}

function inicializarSortable() {
    const contenedor = document.getElementById("contenedor-botones");
    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = Sortable.create(contenedor, {
        animation: 150,
        filter: ".no-sort",
        preventOnFilter: false,
        onStart: function(evt) {
            estaArrastrando = true;
        },
        onEnd: function(evt) {
            setTimeout(() => {
                estaArrastrando = false;
            }, 100);

            const items = contenedor.children;
            const ultimoItem = items[items.length - 1];
            if (ultimoItem.getAttribute("data-fixed") !== "true") {
                for (let k = 0; k < items.length; k++) {
                    if (items[k].getAttribute("data-fixed") === "true") {
                        contenedor.appendChild(items[k]);
                        break;
                    }
                }
            }
            guardarNuevoOrden();
        },
        onCancel: function(evt) {
            estaArrastrando = false;
        }
    });
}

function guardarNuevoOrden() {
    const contenedor = document.getElementById("contenedor-botones");
    const grupos = contenedor.getElementsByClassName("item-group");
    let dispositivo = obtenerDispositivo();

    let datosNuevos = [];
    for (let g of grupos) {
        let idAntiguo = g.getAttribute("data-id");
        datosNuevos.push({
            nombre: localStorage.getItem("nombre_btn_" + idAntiguo),
            nav: localStorage.getItem("ubicacion_nav_btn_" + idAntiguo),
            local: localStorage.getItem("ubicacion_" + dispositivo + "_btn_" + idAntiguo)
        });
    }

    for (let i = 0; i < datosNuevos.length; i++) {
        let nuevoIndex = i + 1;
        if (datosNuevos[i].nombre !== null) {
            localStorage.setItem("nombre_btn_" + nuevoIndex, datosNuevos[i].nombre);
        } else {
            localStorage.removeItem("nombre_btn_" + nuevoIndex);
        }

        if (datosNuevos[i].nav !== null) {
            localStorage.setItem("ubicacion_nav_btn_" + nuevoIndex, datosNuevos[i].nav);
        } else {
            localStorage.removeItem("ubicacion_nav_btn_" + nuevoIndex);
        }

        if (datosNuevos[i].local !== null) {
            localStorage.setItem("ubicacion_" + dispositivo + "_btn_" + nuevoIndex, datosNuevos[i].local);
        } else {
            localStorage.removeItem("ubicacion_" + dispositivo + "_btn_" + nuevoIndex);
        }
    }

    renderizarBotones();
}

function abrirModalOpciones(id, nombre) {
    if (estaArrastrando) return;
    botonSeleccionadoId = id;
    document.getElementById("titulo-opciones-btn").innerText = "Botón: " + nombre;
    document.getElementById("modal-opciones").style.display = "flex";
}

function cerrarModalOpciones() {
    document.getElementById("modal-opciones").style.display = "none";
}

function ejecutarModificarUbicacion() {
    cerrarModalOpciones();
    abrirMapaInteractivo("");
}

function ejecutarModificarTexto() {
    cerrarModalOpciones();
    abrirModalConfiguracion(botonSeleccionadoId, "solo-texto");
}

function ejecutarEliminar() {
    let id = botonSeleccionadoId;
    cerrarModalOpciones();

    if (confirm("¿Estás seguro de que deseas eliminar este botón?")) {
        let dispositivo = obtenerDispositivo();
        
        localStorage.removeItem("nombre_btn_" + id);
        localStorage.removeItem("ubicacion_nav_btn_" + id);
        localStorage.removeItem("ubicacion_" + dispositivo + "_btn_" + id);

        let total = obtenerTotalBotones();
        let contadorValidos = 1;

        for (let i = 1; i <= total; i++) {
            let nombre = localStorage.getItem("nombre_btn_" + i);
            let enlace = localStorage.getItem("ubicacion_nav_btn_" + i) || localStorage.getItem("ubicacion_" + dispositivo + "_btn_" + i);
            
            if (nombre || enlace) {
                if (i !== contadorValidos) {
                    localStorage.setItem("nombre_btn_" + contadorValidos, localStorage.getItem("nombre_btn_" + i) || "");
                    localStorage.setItem("ubicacion_nav_btn_" + contadorValidos, localStorage.getItem("ubicacion_nav_btn_" + i) || "");
                    localStorage.setItem("ubicacion_" + dispositivo + "_" + contadorValidos, localStorage.getItem("ubicacion_" + dispositivo + "_btn_" + i) || "");
                    
                    localStorage.removeItem("nombre_btn_" + i);
                    localStorage.removeItem("ubicacion_nav_btn_" + i);
                    localStorage.removeItem("ubicacion_" + dispositivo + "_btn_" + i);
                }
                contadorValidos++;
            }
        }
        localStorage.setItem("total_botones", contadorValidos);
        renderizarBotones();
    }
}

function abrirModalConfiguracion(id, modo) {
    botonSeleccionadoId = id;
    modoEdicionActual = modo;

    let inputNombre = document.getElementById("input-nombre-btn");
    let inputDirAprox = document.getElementById("input-dir-aprox");
    let inputLinkMaps = document.getElementById("input-link-gmaps");
    let contenedorExtra = document.getElementById("contenedor-campos-extra");
    let tituloModal = document.getElementById("titulo-modal-config");

    inputNombre.value = localStorage.getItem("nombre_btn_" + id) || "";
    inputDirAprox.value = "";
    inputLinkMaps.value = "";
    inputNombre.classList.remove("input-error");

    if (modo === "solo-texto") {
        tituloModal.innerText = "Modificar Nombre";
        contenedorExtra.style.display = "none";
    } else {
        tituloModal.innerText = "Configurar Botón";
        contenedorExtra.style.display = "block";
    }

    document.getElementById("modal-nombre").style.display = "flex";
    inputNombre.focus();
}

function cerrarModalConfig() {
    document.getElementById("modal-nombre").style.display = "none";
}

function limpiarError(elemento) {
    elemento.classList.remove("input-error");
}

function procesarConfiguracion() {
    let inputNombre = document.getElementById("input-nombre-btn");
    let nombre = inputNombre.value.trim();

    if (!nombre) {
        inputNombre.classList.add("input-error");
        return;
    }

    let id = botonSeleccionadoId;
    localStorage.setItem("nombre_btn_" + id, nombre);
    cerrarModalConfig();

    if (modoEdicionActual === "solo-texto") {
        renderizarBotones();
        return;
    }

    let inputLinkMaps = document.getElementById("input-link-gmaps");
    let inputDirAprox = document.getElementById("input-dir-aprox");
    let linkMaps = inputLinkMaps.value.trim();
    let dirAprox = inputDirAprox.value.trim();

    if (linkMaps !== "") {
        let dispositivo = obtenerDispositivo();
        localStorage.setItem("ubicacion_" + dispositivo + "_btn_" + id, linkMaps);
        localStorage.setItem("ubicacion_nav_btn_" + id, linkMaps);

        let totalActual = obtenerTotalBotones();
        if (parseInt(id) === totalActual) {
            localStorage.setItem("total_botones", totalActual + 1);
        }

        renderizarBotones();
        return;
    }

    abrirMapaInteractivo(dirAprox);
}

function abrirMapaInteractivo(direccionInicial = "") {
    document.getElementById("contenedor-mapa-modal").style.display = "flex";

    setTimeout(() => {
        if (!map) {
            map = L.map('map', { tap: false }).setView([40.4168, -3.7038], 6);
            
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles © Esri'
            }).addTo(map);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(map);

            geocoderControl = L.Control.geocoder({
                defaultMarkGeocode: false,
                placeholder: "Buscar dirección...",
                collapsed: false,
                geocoder: L.Control.Geocoder.nominatim()
            }).on('markgeocode', function(e) {
                let center = e.geocode.center;
                map.setView(center, 16);
                colocarChinchetaProvisional(center);
            }).addTo(map);

            let GeoControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function () {
                    let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                    let link = L.DomUtil.create('a', 'btn-geolocalizacion', container);
                    link.href = '#';
                    link.innerHTML = '◎';
                    link.title = 'Usar mi ubicación GPS actual';
                    
                    L.DomEvent.on(link, 'click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        L.DomEvent.preventDefault(e);
                        
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(function(position) {
                                let latLng = [position.coords.latitude, position.coords.longitude];
                                map.setView(latLng, 17);
                                colocarChinchetaProvisional({lat: latLng[0], lng: latLng[1]});
                            }, function(error) {
                                alert("No se pudo obtener la ubicación GPS.");
                            }, {enableHighAccuracy: true, timeout: 10000});
                        } else {
                            alert("Geolocalización no soportada.");
                        }
                    });
                    return container;
                }
            });
            map.addControl(new GeoControl());

            let mapElement = document.getElementById('map');
            mapElement.addEventListener('contextmenu', function(e) { e.preventDefault(); });

            map.on('click', function(e) {
                colocarChinchetaProvisional(e.latlng);
            });

        } else {
            map.invalidateSize();
        }

        if (direccionInicial && direccionInicial !== "") {
            let inputGeocodificador = document.querySelector('.leaflet-control-geocoder-form input');
            if (inputGeocodificador) {
                inputGeocodificador.value = direccionInicial;
                geocoderControl.geocode(direccionInicial);
            }
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                map.setView([position.coords.latitude, position.coords.longitude], 15);
            }, function() {});
        }
    }, 300);
}

function colocarChinchetaProvisional(latlng) {
    coordenadaTemporal = latlng;

    let pinIcon = L.divIcon({
        className: 'custom-pin',
        html: '<div id="elemento-chincheta" style="font-size: 34px; text-align: center; cursor: pointer; transform: scale(1.1); transition: transform 0.2s;">📌</div>',
        iconSize: [35, 35],
        iconAnchor: [17, 35]
    });

    if (marker) map.removeLayer(marker);
    marker = L.marker([latlng.lat, latlng.lng], {icon: pinIcon}).addTo(map);

    setTimeout(() => {
        let pinElement = document.getElementById("elemento-chincheta");
        if (pinElement) {
            let pressTimerModal = null;
            let accionEjecutada = false;

            let abrirModalConfirmacion = function(e) {
                if (e) e.stopPropagation();
                if (accionEjecutada) return;
                accionEjecutada = true;
                document.getElementById("modal-confirmar-pin").style.display = "flex";
            };

            let iniciarAviso = function(e) {
                accionEjecutada = false;
                pressTimerModal = setTimeout(function() {
                    abrirModalConfirmacion(e);
                }, 800);
            };

            let cancelarAviso = function(e) {
                if (pressTimerModal) {
                    clearTimeout(pressTimerModal);
                    pressTimerModal = null;
                }
            };

            let manejarClickDirecto = function(e) {
                if (pressTimerModal) {
                    clearTimeout(pressTimerModal);
                    pressTimerModal = null;
                }
                abrirModalConfirmacion(e);
            };

            pinElement.addEventListener('click', manejarClickDirecto);
            pinElement.addEventListener('mousedown', iniciarAviso);
            pinElement.addEventListener('touchstart', iniciarAviso, {passive: true});
            pinElement.addEventListener('mouseup', cancelarAviso);
            pinElement.addEventListener('mouseleave', cancelarAviso);
            pinElement.addEventListener('touchend', cancelarAviso);
            pinElement.addEventListener('touchmove', cancelarAviso);
        }
    }, 100);
}

function guardarUbicacionDefinitiva() {
    if (!coordenadaTemporal) return;

    let lat = coordenadaTemporal.lat;
    let lng = coordenadaTemporal.lng;
    let dispositivo = obtenerDispositivo();
    let id = botonSeleccionadoId;
    let urlMaps = `https://maps.google.com/?q=${lat},${lng}`;

    localStorage.setItem("ubicacion_" + dispositivo + "_btn_" + id, urlMaps);
    localStorage.setItem("ubicacion_nav_btn_" + id, urlMaps);

    let totalActual = obtenerTotalBotones();
    if (parseInt(id) === totalActual) {
        localStorage.setItem("total_botones", totalActual + 1);
    }

    document.getElementById("modal-confirmar-pin").style.display = "none";
    document.getElementById("contenedor-mapa-modal").style.display = "none";
    
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    coordenadaTemporal = null;

    renderizarBotones();
}

function cerrarModalConfirmarPin() {
    document.getElementById("modal-confirmar-pin").style.display = "none";
}

function cerrarMapa() {
    document.getElementById("contenedor-mapa-modal").style.display = "none";
    document.getElementById("modal-confirmar-pin").style.display = "none";
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    coordenadaTemporal = null;
}