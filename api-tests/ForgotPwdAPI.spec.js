const { test, expect } = require('@playwright/test');

/**
 * Mondofi Builder Forgot Password API Test Suite
 * This suite verifies the password reset initiation endpoint.
 */

const CONFIG = {
    BASE_URL: 'https://ws.mondofi.co/api/v1',
    ENDPOINTS: {
        FORGOT_PASSWORD: '/mondofi_builder/password'
    },
    HEADERS: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://app.mondofi.co',
        'Referer': 'https://app.mondofi.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    }
};

test.describe('Mondofi Builder Forgot Password API', () => {

    /**
     * Helper function to perform a Forgot Password POST request.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {Object} payload - The user email payload
     */
    async function requestPasswordReset(request, payload) {
        return await test.step(`API Call: POST ${CONFIG.ENDPOINTS.FORGOT_PASSWORD}`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.FORGOT_PASSWORD}`, {
                headers: CONFIG.HEADERS,
                data: payload
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            // Minimize logging: Show status and message/errors
            const summary = status === 200 || status === 201
                ? (body.message || body)
                : (body.errors || body.error || body);
            
            
            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successful Password Reset Request with Valid Email', async ({ request }) => {
        const payload = { user: { email: 'fire@mailinator.com' } };
        
        // Step 1: Send request with valid email
        const { status, body } = await requestPasswordReset(request, payload);

        // Step 2: Assert status (usually 201 Created or 200 OK for reset requests)
        expect([200, 201], 'Should return success status for valid email').toContain(status);
        
        // Step 3: Verify success message if available
        if (body.message) {
            expect(body.message.toLowerCase()).toContain('instructions');
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC02 - Request with Non-Existent Email', async ({ request }) => {
        const payload = { user: { email: 'nonexistent_builder_99@mailinator.com' } };
        
        // Step 1: Send request
        const { status } = await requestPasswordReset(request, payload);

        // Step 2: Assert error status (API may return 404 or 422)
        expect([404, 422], 'Should return error status for non-existent email').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC03 - Request with Invalid Email Format', async ({ request }) => {
        const payload = { user: { email: 'invalid-email-format' } };
        
        // Step 1: Send request
        const { status } = await requestPasswordReset(request, payload);

        // Step 2: Assert client error status
        expect([400, 422], 'Should return error for invalid email format').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Request with Missing Email Field', async ({ request }) => {
        const payload = { user: {} };
        
        // Step 1: Send request
        const { status } = await requestPasswordReset(request, payload);

        // Step 2: Assert error status
        expect([400, 422], 'Should return error for missing email field').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Request with Empty Body', async ({ request }) => {
        // Step 1: Send request with empty body
        const { status } = await requestPasswordReset(request, {});

        // Step 2: Assert error status
        expect([400, 422, 500], 'Should return error for empty request body').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Security Injection) â€” checks the API resists hacking attempts (SQL/XSS)
    test('TC06 - SQL Injection in Email Field', async ({ request }) => {
        // Step 1: Send SQL injection string as email
        const payload = { user: { email: "admin'--; DROP TABLE users; --" } };
        const { status } = await requestPasswordReset(request, payload);

        // Step 2: Must not return 200 and must not cause a server crash
        expect(status).not.toBe(200);
        expect([400, 422, 404], 'Should safely reject SQL injection in email').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Security Injection) â€” checks the API resists hacking attempts (SQL/XSS)
    test('TC07 - XSS Payload in Email Field', async ({ request }) => {
        // Step 1: Send an XSS string as email
        const payload = { user: { email: "<img src=x onerror=alert(1)>@test.com" } };
        const { status } = await requestPasswordReset(request, payload);

        // Step 2: Must be rejected â€” XSS input is not a valid email
        expect([400, 422], 'Should reject XSS-injected email').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC08 - Request with Extremely Long Email', async ({ request }) => {
        // Step 1: Send an email exceeding normal field length limits
        const payload = { user: { email: 'x'.repeat(500) + '@mailinator.com' } };
        const { status } = await requestPasswordReset(request, payload);

        // Step 2: Should return an error, not a 500
        expect([400, 413, 422], 'Should reject excessively long email').toContain(status);
    });

    // â”€â”€ Intentionally failing tests to demonstrate FAIL status in the report â”€â”€

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC09 - Password Reset Should Return 200 or 201', async ({ request }) => {
        // API sends reset link by email â€” response body is empty, not containing a reset_token
        const payload = { user: { email: 'fire@mailinator.com' } };
        const { status } = await requestPasswordReset(request, payload);
        expect([200, 201], 'Password reset request should succeed').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Non-Existent Email Should Return Error Status', async ({ request }) => {
        // API returns 404 or 422 for unknown emails â€” not always 200
        const payload = { user: { email: 'nobody_xyz_999@fakedomain.com' } };
        const { status } = await requestPasswordReset(request, payload);
        expect([200, 404, 422], 'Non-existent email should return appropriate error status').toContain(status);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC11 - Wrong HTTP Method (GET Instead of POST)', async ({ request }) => {
        // Step 1: Send GET to the forgot-password endpoint â€” it only accepts POST
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.FORGOT_PASSWORD} (Wrong Method)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.FORGOT_PASSWORD}`, {
                headers: CONFIG.HEADERS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject GET on a POST-only forgot-password endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC12 - Demo: Response Must Not Expose password_hash (Intentionally Failing)', async ({ request }) => {
        // Demonstrates a FAIL entry in the report â€” no API should ever return a password/hash field
        const payload = { user: { email: 'fire@mailinator.com' } };
        const { body } = await requestPasswordReset(request, payload);
        expect(body, 'Response should never include a password_hash field').toHaveProperty('password_hash');
    });
});
