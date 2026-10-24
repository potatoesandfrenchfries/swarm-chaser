#include <stdio.h>

static int average(int total, int count) { return total / count; } // BUG

int main(int argc, char **argv) {
    (void)argv;
    printf("%d\n", average(10, argc - 1));
    return 0;
}
