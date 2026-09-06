# Vobix Meet · preparación aparcada para una fase futura

> Estado actual: **APARCADO**. No contratar, activar ni presentar Vobix Meet o Vobix Live como operativos hasta que el propietario reactive expresamente esta fase.

## Alcance seguro

- Objetivo: más de 50.000 participantes conectados simultáneamente en el conjunto de la plataforma.
- Sala interactiva: hasta 1.000 participantes, con publicación de cámara y micrófono limitada a anfitriones y moderadores en salas grandes.
- Una única sesión con decenas de miles de espectadores debe usar un modo de escenario o transmisión, no una malla WebRTC entre todos.
- Render mantiene la API, autenticación y PostgreSQL. LiveKit Cloud transporta audio y vídeo mediante SFU administrado.

## Variables privadas requeridas en Render

```text
LIVEKIT_URL=wss://<proyecto>.livekit.cloud
LIVEKIT_API_KEY=<secreto de Render>
LIVEKIT_API_SECRET=<secreto de Render>
LIVEKIT_MAX_CONNECTIONS=50000
LIVEKIT_ENTERPRISE_CONTRACT=true
VOBIX_MEET_CAPACITY_VERIFIED=false
```

`VOBIX_MEET_CAPACITY_VERIFIED` debe permanecer en `false` hasta que LiveKit confirme la cuota empresarial y una prueba de carga alcance el objetivo acordado. Las claves nunca deben entrar en GitHub, la APK ni el navegador.

## Condiciones para declarar producción

1. Contrato Enterprise de LiveKit Cloud con al menos 50.000 conexiones concurrentes por proyecto.
2. Regiones acordadas para Europa y los mercados principales de VobixChat.
3. Prueba progresiva de señalización y medios: 1.000, 5.000, 10.000, 25.000 y 50.000 conexiones.
4. Métricas aceptadas de conexión, reconexión, audio, vídeo, errores y latencia.
5. Plan de degradación: reducir calidad de vídeo, pasar asistentes a solo audio y limitar publicadores antes de rechazar conexiones.
6. Solo después de aprobar la prueba, cambiar `VOBIX_MEET_CAPACITY_VERIFIED=true`.

## PIN de registro

El PIN de acceso continúa en modo local de pruebas mediante `TEST_PIN_MODE` y `TEST_PIN`. La contratación de LiveKit no activa Infobip ni SMS de autenticación.
