#include <limits.h>
#include <stdio.h>

static int next(int x) { return x + 1; } // BUG

int main(void) {
    printf("%d\n", next(INT_MAX));
    return 0;
}
