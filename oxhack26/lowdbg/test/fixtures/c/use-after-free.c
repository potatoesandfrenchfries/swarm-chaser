#include <stdio.h>
#include <stdlib.h>

struct node { int value; struct node *next; };

int main(void) {
    struct node *n = malloc(sizeof *n);
    n->value = 42;
    n->next = NULL;
    free(n);
    printf("%d\n", n->value); // BUG
    return 0;
}
