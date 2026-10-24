#include <stdlib.h>

static int first(int fill) {
    int *a = NULL;
    if (fill) a = malloc(sizeof *a);
    return *a; // BUG
}

int main(void) { return first(0); }
