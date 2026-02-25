<script>
    const features = [
        {
            title: "instant signals",
            text: "detect updates across your stack in real time without noise."
        },
        {
            title: "quiet intelligence",
            text: "only what matters — filtered, structured, and intentional."
        },
        {
            title: "lightweight core",
            text: "fast, minimal, engineered to disappear into your workflow."
        }
    ];

    import logo from '$lib/assets/piq-logo.png';
</script>

<svelte:head>
    <title>piq</title>
    <meta name="description" content="piq — lightweight intelligent update monitoring." />
</svelte:head>

<main>
    <section class="hero">
        <img alt="piq" class="brand" src={logo} />

        <h1>
            know when things change.<br />
            nothing more.
        </h1>

        <p class="subtitle">
            a lightweight monitoring layer for signals, updates, and events —
            built for focus.
        </p>

        <button class="cta">join early access</button>
    </section>

    <section class="features">
        {#each features as f}
            <div class="feature">
                <h3>{f.title}</h3>
                <p>{f.text}</p>
            </div>
        {/each}
    </section>



    <footer>
        <p>© {new Date().getFullYear()} piq</p>
    </footer>
</main>

<style>
    :global(body) {
        margin: 0;
        background: #0a0a0a;
        color: #f5f5f5;
        font-family: system-ui, -apple-system, sans-serif;
    }

    main {
        max-width: 1000px;
        margin: 0 auto;
        padding: 80px 24px;
    }

    .hero {
        margin-bottom: 120px;
    }

    .brand {
        user-select: none
    ;
        height: 4rem;
        letter-spacing: 0.3em;
        opacity: 1;
        margin-bottom: 24px;
        text-transform: lowercase;
    }

    h1 {
        font-size: 48px;
        font-weight: 500;
        line-height: 1.2;
        margin: 0 0 24px 0;
    }

    .subtitle {
        max-width: 520px;
        opacity: 0.7;
        line-height: 1.6;
        margin-bottom: 40px;
    }

    .cta {
        background: #ffffff;
        color: #000;
        border: none;
        padding: 14px 22px;
        font-size: 14px;
        cursor: pointer;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .cta:hover {
        opacity: 0.8;
    }

    .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 48px;
        margin-bottom: 120px;
    }

    .feature h3 {
        font-size: 16px;
        margin-bottom: 12px;
        letter-spacing: 0.1em;
        text-transform: lowercase;
    }

    .feature p {
        opacity: 0.7;
        line-height: 1.6;
    }

    footer {
        opacity: 0.4;
        font-size: 12px;
    }
</style>
