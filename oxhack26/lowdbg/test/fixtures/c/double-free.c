#include <stdlib.h>

static void release(int *p) { free(p); }

int main(void) {
    int *p = malloc(sizeof *p);
    release(p);
    free(p); // BUG
    return 0;
}
