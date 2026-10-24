#include <assert.h>

static int checked_div(int a, int b) {
    assert(b != 0); // BUG
    return a / b;
}

int main(void) { return checked_div(1, 0); }
