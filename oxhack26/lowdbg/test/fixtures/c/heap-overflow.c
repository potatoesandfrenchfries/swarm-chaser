#include <stdlib.h>
#include <string.h>

int main(void) {
    char *name = malloc(8);
    strcpy(name, "too long for it"); // BUG
    free(name);
    return 0;
}
