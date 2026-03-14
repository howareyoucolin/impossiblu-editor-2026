import React from 'react'

export function Setup({ error, isSettingUp, onSetup }) {
    return (
        <main className="setup-screen">
            <section className="setup-card">
                <h1>Setup</h1>
                <p>
                    This will create a `local-data` folder with full permission and
                    initialize an empty git repository inside it.
                </p>
                {error ? <p className="setup-error">{error}</p> : null}
                <button
                    className="setup-button"
                    disabled={isSettingUp}
                    onClick={onSetup}
                    type="button"
                >
                    {isSettingUp ? 'Setting Up...' : 'Setup'}
                </button>
            </section>
        </main>
    )
}
